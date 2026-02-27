package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
    "time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type DockerCollector struct {
	cli          *client.Client
    prevNetStats map[string]netStatState // ContainerID -> State
}

type netStatState struct {
    rx uint64
    tx uint64
    ts time.Time
}

type ContainerMetric struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Image       string  `json:"image"`
	State       string  `json:"state"`
    Status      string  `json:"status"` // Up 2 hours
    Ports       string  `json:"ports"`  // 8080->80
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryUsage float64 `json:"memory_usage"` // bytes
    NetRx       float64 `json:"net_rx"`       // bytes
    NetTx       float64 `json:"net_tx"`       // bytes
}

// Custom structs to avoid dependency hell with types.StatsJSON
type DockerStats struct {
    PreCPUStats CPUStats                `json:"precpu_stats"`
    CPUStats    CPUStats                `json:"cpu_stats"`
    MemoryStats MemoryStats             `json:"memory_stats"`
    Networks    map[string]NetworkStats `json:"networks"`
}

type NetworkStats struct {
    RxBytes uint64 `json:"rx_bytes"`
    TxBytes uint64 `json:"tx_bytes"`
}

type CPUStats struct {
    CPUUsage    CPUUsage `json:"cpu_usage"`
    SystemUsage uint64   `json:"system_cpu_usage"`
    OnlineCPUs  uint32   `json:"online_cpus"`
}

type CPUUsage struct {
    TotalUsage  uint64   `json:"total_usage"`
    PercpuUsage []uint64 `json:"percpu_usage"`
}

type MemoryStats struct {
    Usage uint64 `json:"usage"`
    Limit uint64 `json:"limit"`
}

func NewDockerCollector() (*DockerCollector, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	return &DockerCollector{
        cli: cli,
        prevNetStats: make(map[string]netStatState),
    }, nil
}

func (dc *DockerCollector) ListRunningContainers() ([]container.Summary, error) {
    return dc.cli.ContainerList(context.Background(), container.ListOptions{})
}

func (dc *DockerCollector) GetContainerMetrics() ([]ContainerMetric, error) {
    listCtx, listCancel := context.WithTimeout(context.Background(), 5*time.Second)
	containers, err := dc.cli.ContainerList(listCtx, container.ListOptions{})
    listCancel()
    
	if err != nil {
		return nil, err
	}

	var metrics []ContainerMetric
    now := time.Now()

	for _, c := range containers {
		// Get Stats with Strict Context Timeout
        statCtx, statCancel := context.WithTimeout(context.Background(), 2*time.Second)
		stats, err := dc.cli.ContainerStats(statCtx, c.ID, false)
		if err != nil {
            statCancel()
			fmt.Printf("Error getting stats for %s: %v\n", c.ID, err)
			continue
		}
		
		var v DockerStats
		dec := json.NewDecoder(stats.Body)
		err = dec.Decode(&v)
		stats.Body.Close()
        statCancel()

		if err != nil {
			continue
		}

		// Calculate CPU
		cpuPercent := calculateCPUPercentUnix(v.PreCPUStats.CPUUsage.TotalUsage, v.PreCPUStats.SystemUsage, &v)
		memUsage := float64(v.MemoryStats.Usage)
        
        // Calculate Net Total
        var totalRx, totalTx uint64
        for _, net := range v.Networks {
            totalRx += net.RxBytes
            totalTx += net.TxBytes
        }
        
        // Calculate Rate
        var rxRate, txRate float64
        if prev, ok := dc.prevNetStats[c.ID]; ok {
            duration := now.Sub(prev.ts).Seconds()
            if duration > 0 {
                // Check for restart/reset (if current < prev, assume reset)
                if totalRx >= prev.rx {
                    rxRate = float64(totalRx - prev.rx) / duration
                } else {
                    rxRate = float64(totalRx) / duration 
                }
                
                if totalTx >= prev.tx {
                    txRate = float64(totalTx - prev.tx) / duration
                } else {
                     txRate = float64(totalTx) / duration
                }
            }
        }
        
        // Update State
        dc.prevNetStats[c.ID] = netStatState{
            rx: totalRx,
            tx: totalTx,
            ts: now,
        }
        
        // Format Ports
        var ports []string
        for _, p := range c.Ports {
            if p.PublicPort != 0 {
                ports = append(ports, fmt.Sprintf("%d->%d/%s", p.PublicPort, p.PrivatePort, p.Type))
            }
        }
        portStr := strings.Join(ports, ", ")
        
        // Clean name (remove leading /)
        name := ""
        if len(c.Names) > 0 {
            name = c.Names[0]
            if strings.HasPrefix(name, "/") {
                name = name[1:]
            }
        }

		metrics = append(metrics, ContainerMetric{
			ID:          c.ID[:12],
			Name:        name,
			Image:       c.Image,
			State:       c.State,
            Status:      c.Status,
            Ports:       portStr,
			CPUPercent:  cpuPercent,
			MemoryUsage: memUsage,
            NetRx:       rxRate,
            NetTx:       txRate,
		})
	}

	return metrics, nil
}

func calculateCPUPercentUnix(previousCPU, previousSystem uint64, v *DockerStats) float64 {
	var (
		cpuPercent = 0.0
		// calculate the change for the cpu usage of the container in between readings
		cpuDelta = float64(v.CPUStats.CPUUsage.TotalUsage) - float64(previousCPU)
		// calculate the change for the entire system between readings
		systemDelta = float64(v.CPUStats.SystemUsage) - float64(previousSystem)
		onlineCPUs  = float64(v.CPUStats.OnlineCPUs)
	)

	if onlineCPUs == 0.0 {
		onlineCPUs = float64(len(v.CPUStats.CPUUsage.PercpuUsage))
	}
	if systemDelta > 0.0 && cpuDelta > 0.0 {
		cpuPercent = (cpuDelta / systemDelta) * onlineCPUs * 100.0
	}

	return math.Round(cpuPercent*100) / 100
}

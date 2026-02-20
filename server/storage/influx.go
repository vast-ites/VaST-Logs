package storage

import (
	"context"
	"fmt"
    "encoding/json"
	"time"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
)

type MetricsStore struct {
	client   influxdb2.Client
	writeAPI api.WriteAPIBlocking
	queryAPI api.QueryAPI
	org      string
	bucket   string
}

func NewMetricsStore(url, token, org, bucket string) *MetricsStore {
	client := influxdb2.NewClient(url, token)
	writeAPI := client.WriteAPIBlocking(org, bucket)
	queryAPI := client.QueryAPI(org)
	return &MetricsStore{
		client:   client,
		writeAPI: writeAPI,
		queryAPI: queryAPI,
		org:      org,
		bucket:   bucket,
	}
}

func (s *MetricsStore) WriteSystemMetric(
    host string, 
    cpu float64, cpuCount int, cpuPhysical int, cpuModel string, cpuFreq float64,
    mem float64, memTotal uint64, swapUsage float64, swapTotal uint64,
    disk float64, diskTotal uint64, partitionsJSON string,
    sent, recv uint64, recvRate, sentRate float64,
    diskReadRate, diskWriteRate, diskReadIOPS, diskWriteIOPS float64,
    interfacesJSON string, ddosStatus, processRaw string,
    uptime uint64,
) error {
	p := influxdb2.NewPointWithMeasurement("system")
    p.AddTag("host", host)
	p.AddField("cpu_percent", cpu)
	p.AddField("cpu_count", cpuCount)
    p.AddField("cpu_physical", cpuPhysical)
    p.AddField("cpu_model", cpuModel)
    p.AddField("cpu_freq", cpuFreq)
	p.AddField("memory_usage", mem)
	p.AddField("memory_total", float64(memTotal))
    p.AddField("swap_usage", swapUsage)
    p.AddField("swap_total", float64(swapTotal))
	p.AddField("disk_usage", disk)
	p.AddField("disk_total", float64(diskTotal))
    p.AddField("partitions", partitionsJSON)
	p.AddField("bytes_sent", float64(sent))
	p.AddField("bytes_recv", float64(recv))
    p.AddField("net_recv_rate", recvRate)
    p.AddField("net_sent_rate", sentRate)
    p.AddField("disk_read_rate", diskReadRate)
    p.AddField("disk_write_rate", diskWriteRate)
    p.AddField("disk_read_iops", diskReadIOPS)
    p.AddField("disk_write_iops", diskWriteIOPS)
    p.AddField("interfaces", interfacesJSON)
	p.AddField("ddos_status", ddosStatus)
    p.AddField("process_raw", processRaw)
    p.AddField("uptime", float64(uptime))
	p.SetTime(time.Now())

	return s.writeAPI.WritePoint(context.Background(), p)
}

type SystemMetricData struct {
	CPU      float64 `json:"cpu_percent"`
    CPUCount int     `json:"cpu_count"`
    CPUPhysical int  `json:"cpu_physical"`
    CPUModel string  `json:"cpu_model"`
    CPUFreq  float64 `json:"cpu_freq"`
	Mem      float64 `json:"memory_usage"`
    MemTotal uint64  `json:"memory_total"`
    SwapUsage float64 `json:"swap_usage"`
    SwapTotal uint64  `json:"swap_total"`
	Disk     float64 `json:"disk_usage"`
    DiskTotal uint64 `json:"disk_total"`
    Partitions interface{} `json:"partitions"`
    NetRecvRate float64 `json:"net_recv_rate"`
    NetSentRate float64 `json:"net_sent_rate"`
    DiskReadRate float64 `json:"disk_read_rate"`
    DiskWriteRate float64 `json:"disk_write_rate"`
    DiskReadIOPS float64 `json:"disk_read_iops"`
    DiskWriteIOPS float64 `json:"disk_write_iops"`
    Interfaces interface{} `json:"interfaces"`
	DDoSStatus string      `json:"ddos_status"`
    ProcessRaw string      `json:"process_raw"`
    Uptime     uint64      `json:"uptime"`
    Timestamp  time.Time   `json:"timestamp"`
}

func (s *MetricsStore) GetLatestSystemMetrics(host string) (*SystemMetricData, error) {
    filter := "|> filter(fn: (r) => r[\"_measurement\"] == \"system\")"
    if host != "" {
        filter = fmt.Sprintf(`|> filter(fn: (r) => r["_measurement"] == "system" and r["host"] == "%s")`, host)
    }

	query := fmt.Sprintf(`
	from(bucket: "%s")
	|> range(start: -5m)
	%s
	|> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
    |> group()
    |> sort(columns: ["_time"], desc: true)
    |> limit(n: 1)
	`, s.bucket, filter)

	result, err := s.queryAPI.Query(context.Background(), query)
	if err != nil {
		return nil, err
	}
	defer result.Close()

	data := &SystemMetricData{}
	
	if result.Next() {
		record := result.Record()
        // fmt.Printf("Influx Record Values: %v\n", record.Values())
        
        getFloat := func(k string) float64 {
            if v, ok := record.ValueByKey(k).(float64); ok { return v }
            return 0.0
        }
        getString := func(k string) string {
            if v, ok := record.ValueByKey(k).(string); ok { return v }
            return ""
        }
        getInt := func(k string) int {
            if v, ok := record.ValueByKey(k).(int64); ok { return int(v) }
            if v, ok := record.ValueByKey(k).(float64); ok { return int(v) }
            return 0
        }
        getJSON := func(k string) interface{} {
            str := getString(k)
            if str == "" { return nil }
            var out interface{}
            json.Unmarshal([]byte(str), &out)
            return out
        }

        data.CPU = getFloat("cpu_percent")
        data.CPUCount = getInt("cpu_count")
        data.CPUPhysical = getInt("cpu_physical")
        data.CPUModel = getString("cpu_model")
        data.CPUFreq = getFloat("cpu_freq")
        data.Mem = getFloat("memory_usage")
        data.MemTotal = uint64(getFloat("memory_total"))
        data.SwapUsage = getFloat("swap_usage")
        data.SwapTotal = uint64(getFloat("swap_total"))
        data.Disk = getFloat("disk_usage")
        data.DiskTotal = uint64(getFloat("disk_total"))
        data.Partitions = getJSON("partitions")
        data.NetRecvRate = getFloat("net_recv_rate")
        data.NetSentRate = getFloat("net_sent_rate")
        data.DiskReadRate = getFloat("disk_read_rate")
        data.DiskWriteRate = getFloat("disk_write_rate")
        data.DiskReadIOPS = getFloat("disk_read_iops")
        data.DiskWriteIOPS = getFloat("disk_write_iops")
        data.Interfaces = getJSON("interfaces")
        data.DDoSStatus = getString("ddos_status")
        data.ProcessRaw = getString("process_raw")
        data.Uptime = uint64(getFloat("uptime"))
        data.Timestamp = record.Time()
        
        return data, nil
    }
    
    if result.Err() != nil {
		return nil, result.Err()
	}

    return nil, fmt.Errorf("no data found")
}

func (s *MetricsStore) GetSystemMetricHistory(rangeStr, aggregateWindow, host string) ([]SystemMetricData, error) {
    hostFilter := ""
    if host != "" {
        hostFilter = fmt.Sprintf(`r["host"] == "%s" and `, host)
    }
    
    // Downsample using aggregateWindow
	query := fmt.Sprintf(`
	from(bucket: "%s")
	|> range(%s)
	|> filter(fn: (r) => r["_measurement"] == "system")
    |> filter(fn: (r) => %s(r["_field"] == "cpu_percent" or r["_field"] == "memory_usage" or r["_field"] == "disk_usage" or r["_field"] == "net_recv_rate" or r["_field"] == "bytes_sent" or r["_field"] == "disk_read_rate" or r["_field"] == "disk_write_rate"))
    |> aggregateWindow(every: %s, fn: mean, createEmpty: false)
	|> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
	`, s.bucket, rangeStr, hostFilter, aggregateWindow)

	result, err := s.queryAPI.Query(context.Background(), query)
	if err != nil {
		return nil, err
	}
	defer result.Close()

	var history []SystemMetricData
	
	for result.Next() {
		record := result.Record()
		getFloat := func(k string) float64 {
			if v, ok := record.ValueByKey(k).(float64); ok { return v }
			return 0.0
		}
        getString := func(k string) string {
			if v, ok := record.ValueByKey(k).(string); ok { return v }
			return ""
		}

        history = append(history, SystemMetricData{
            CPU: getFloat("cpu_percent"),
            Mem: getFloat("memory_usage"),
            Disk: getFloat("disk_usage"),
            NetRecvRate: getFloat("net_recv_rate"),
            NetSentRate: getFloat("net_sent_rate"), 
            DiskReadRate: getFloat("disk_read_rate"),
            DiskWriteRate: getFloat("disk_write_rate"),
            DDoSStatus: getString("ddos_status"), 
            Timestamp: record.Time(),
        })
	}

	if result.Err() != nil {
		return nil, result.Err()
	}

	return history, nil
}

type HostMetadata struct {
    Hostname string    `json:"hostname"`
    IP       string    `json:"ip"`
    LastSeen time.Time `json:"last_seen"`
}

// GetHosts returns a list of unique hosts with metadata (IP) found in the last hour
func (s *MetricsStore) GetHosts() ([]HostMetadata, error) {
    // Get last reported interfaces for each host
    query := fmt.Sprintf(`
    from(bucket: "%s")
    |> range(start: -1h)
    |> filter(fn: (r) => r["_measurement"] == "system")
    |> filter(fn: (r) => r["_field"] == "interfaces")
    |> group(columns: ["host"])
    |> last()
    |> keep(columns: ["host", "_value", "_time"])
    `, s.bucket)

    result, err := s.queryAPI.Query(context.Background(), query)
    if err != nil {
        return nil, err
    }
    defer result.Close()

    var hosts []HostMetadata
    
    // Struct to parse the JSON string from Influx
    type ifaceStub struct {
        Name string `json:"name"`
        IP   string `json:"ip"`
    }

    for result.Next() {
        host := ""
        if h, ok := result.Record().ValueByKey("host").(string); ok {
            host = h
        }
        
        jsonStr := ""
        if v, ok := result.Record().Value().(string); ok {
            jsonStr = v
        }

        ip := "Unknown"
        if jsonStr != "" {
            var ifaces []ifaceStub
            if err := json.Unmarshal([]byte(jsonStr), &ifaces); err == nil {
                // Find first suitable IP
                for _, i := range ifaces {
                     if i.IP != "" && i.IP != "127.0.0.1" && i.IP != "::1" {
                         ip = i.IP
                         break
                     }
                }
            }
        }
        
        if host != "" {
            hosts = append(hosts, HostMetadata{
                Hostname: host,
                IP:       ip,
                LastSeen: result.Record().Time(),
            })
        }
    }
    return hosts, nil
}

// WriteInterfaceMetric writes a single interface's metrics to InfluxDB
func (s *MetricsStore) WriteInterfaceMetric(host, name string, bytesSent, bytesRecv uint64) error {
    p := influxdb2.NewPointWithMeasurement("network_interface")
    p.AddTag("host", host)
    p.AddTag("interface", name)
    p.AddField("bytes_sent", float64(bytesSent))
    p.AddField("bytes_recv", float64(bytesRecv))
    p.SetTime(time.Now())

    s.writeAPI.WritePoint(context.Background(), p)
    return nil
}

type InterfaceMetricData struct {
    Interface   string    `json:"interface"`
    BytesRecv   float64   `json:"bytes_recv"`
    BytesSent   float64   `json:"bytes_sent"`
    Time        time.Time `json:"time"`
}

func (s *MetricsStore) GetInterfaceHistory(rangeStr, aggregateWindow, host string) ([]InterfaceMetricData, error) {
    hostFilter := ""
    if host != "" {
        hostFilter = fmt.Sprintf(`|> filter(fn: (r) => r["host"] == "%s")`, host)
    }

    // We want to calculate RATE (bytes/sec) from the Counters (bytes_sent/recv)
    query := fmt.Sprintf(`
    from(bucket: "%s")
    |> range(%s)
    |> filter(fn: (r) => r["_measurement"] == "network_interface")
    %s
    |> derivative(unit: 1s, nonNegative: true) 
    |> aggregateWindow(every: %s, fn: mean, createEmpty: false)
    |> pivot(rowKey:["_time", "interface"], columnKey: ["_field"], valueColumn: "_value")
    `, s.bucket, rangeStr, hostFilter, aggregateWindow)

    result, err := s.queryAPI.Query(context.Background(), query)
    if err != nil {
        return nil, err
    }
    defer result.Close()

    var history []InterfaceMetricData

    for result.Next() {
        record := result.Record()
        getFloat := func(k string) float64 {
            if v, ok := record.ValueByKey(k).(float64); ok { return v }
            return 0.0
        }
        getString := func(k string) string {
            if v, ok := record.ValueByKey(k).(string); ok { return v }
            return ""
        }

        history = append(history, InterfaceMetricData{
            Interface: getString("interface"),
            BytesRecv: getFloat("bytes_recv"), // This is now a RATE (B/s) due to derivative
            BytesSent: getFloat("bytes_sent"), // This is now a RATE (B/s)
            Time:      record.Time(),
        })
    }
    return history, nil
}


// WriteContainerMetric writes a single container's metrics to InfluxDB
func (m *MetricsStore) WriteContainerMetric(host, id, name, image, state, status, ports string, cpu, mem, netRx, netTx float64) error {
    p := influxdb2.NewPointWithMeasurement("containers").
        AddTag("host", host).
        AddTag("container_id", id).
        AddTag("container_name", name).
        AddTag("image", image).
        AddTag("state", state).
        AddField("status", status).
        AddField("ports", ports).
        AddField("cpu_percent", cpu).
        AddField("memory_usage", mem).
        AddField("net_rx", netRx).
        AddField("net_tx", netTx).
        SetTime(time.Now())

    m.writeAPI.WritePoint(context.Background(), p)
    return nil
}

type ContainerMetricData struct {
    ID          string  `json:"id"`
    Name        string  `json:"name"`
    Image       string  `json:"image"`
    State       string  `json:"state"`
    Status      string  `json:"status"`
    Ports       string  `json:"ports"`
    CPU         float64 `json:"cpu"`
    Mem         float64 `json:"mem"`
    NetRx       float64 `json:"net_rx"`
    NetTx       float64 `json:"net_tx"`
    Timestamp   time.Time `json:"timestamp"`
}

// GetLatestContainerMetrics returns the latest metrics for each active container
func (m *MetricsStore) GetLatestContainerMetrics(host string) ([]ContainerMetricData, error) {
    // Flux query to get the last record for every container in the last 1 minute
    
    hostFilter := ""
    if host != "" {
        hostFilter = fmt.Sprintf(`|> filter(fn: (r) => r["host"] == "%s")`, host)
    }

    query := fmt.Sprintf(`
    from(bucket: "%s")
    |> range(start: -1m)
    |> filter(fn: (r) => r["_measurement"] == "containers")
    %s
    |> group(columns: ["container_id", "_field"])
    |> last()
    |> pivot(rowKey:["_time", "container_id", "container_name", "image", "state"], columnKey: ["_field"], valueColumn: "_value")
    `, m.bucket, hostFilter)

    result, err := m.queryAPI.Query(context.Background(), query)
    if err != nil {
        return nil, err
    }
    defer result.Close()

    var metrics []ContainerMetricData
    
    for result.Next() {
        record := result.Record()
        
        // Helper to safely get string/float
        getString := func(k string) string {
            if v, ok := record.ValueByKey(k).(string); ok { return v }
            return ""
        }
        getFloat := func(k string) float64 {
            if v, ok := record.ValueByKey(k).(float64); ok { return v }
            return 0.0
        }

        metrics = append(metrics, ContainerMetricData{
            ID:        getString("container_id"),
            Name:      getString("container_name"),
            Image:     getString("image"),
            State:     getString("state"),
            Status:    getString("status"),
            Ports:     getString("ports"),
            CPU:       getFloat("cpu_percent"),
            Mem:       getFloat("memory_usage"),
            NetRx:     getFloat("net_rx"),
            NetTx:     getFloat("net_tx"),
            Timestamp: record.Time(),
        })
    }
    return metrics, nil
}

// GetContainerNames returns a list of active container names for a host
func (m *MetricsStore) GetContainerNames(host string) ([]string, error) {
    if host == "" { return nil, nil }
    
    // Efficient query just for names
    // Strategy: Filter for cpu_percent (always present), group by name, take 1.
    query := fmt.Sprintf(`
    from(bucket: "%s")
    |> range(start: -5m)
    |> filter(fn: (r) => r["_measurement"] == "containers")
    |> filter(fn: (r) => r["host"] == "%s")
    |> filter(fn: (r) => r["_field"] == "cpu_percent")
    |> group(columns: ["container_name"])
    |> limit(n: 1)
    `, m.bucket, host)

    result, err := m.queryAPI.Query(context.Background(), query)
    if err != nil {
        return nil, err
    }
    defer result.Close()

    var names []string
    for result.Next() {
        // Get tag value
        if v, ok := result.Record().ValueByKey("container_name").(string); ok {
             names = append(names, v)
        }
    }
    if result.Err() != nil {
        return nil, result.Err()
    }
    return names, nil
}

func (s *MetricsStore) Close() {
	s.client.Close()
}

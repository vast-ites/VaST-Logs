package api

import (
    "fmt"
    "time"
    "strconv"
)

// ParseTimeRange parses duration, from, to query parameters and returns
// a string suitable for InfluxDB Flux range() function, start and end time.Time,
// and aggregation window duration string.
func ParseTimeRange(durationStr, fromStr, toStr string) (string, time.Time, time.Time, string, error) {
    var start time.Time
    var end time.Time
    var rangeStr string
    var aggregateWindow string

    if fromStr != "" && toStr != "" {
        // First try parsing as RFC3339
        parsedFrom, errRFC1 := time.Parse(time.RFC3339, fromStr)
        parsedTo, errRFC2 := time.Parse(time.RFC3339, toStr)

        var parsedSuccessfully bool

        if errRFC1 == nil && errRFC2 == nil {
            start = parsedFrom.UTC()
            end = parsedTo.UTC()
            parsedSuccessfully = true
        } else {
            // Fallback: Parse from/to as Unix timestamp (milliseconds)
            fromMs, err1 := strconv.ParseInt(fromStr, 10, 64)
            toMs, err2 := strconv.ParseInt(toStr, 10, 64)

            if err1 == nil && err2 == nil {
                start = time.UnixMilli(fromMs).UTC()
                end = time.UnixMilli(toMs).UTC()
                parsedSuccessfully = true
            }
        }

        if parsedSuccessfully {
            // InfluxDB range with absolute RFC3339 times:
            // e.g., range(start: 2021-01-01T00:00:00Z, stop: 2021-01-01T01:00:00Z)
            rangeStr = fmt.Sprintf("start: %s, stop: %s", start.Format(time.RFC3339), end.Format(time.RFC3339))
            
            // Calculate aggregate window based on total duration
            totalDur := end.Sub(start)
            if totalDur >= 30*24*time.Hour {
                aggregateWindow = "1h"
            } else if totalDur >= 7*24*time.Hour {
                aggregateWindow = "5m"
            } else if totalDur >= 24*time.Hour {
                aggregateWindow = "1m"
            } else if totalDur >= 6*time.Hour {
                aggregateWindow = "1m"
            } else if totalDur >= 1*time.Hour {
                aggregateWindow = "1m"
            } else {
                aggregateWindow = "10s"
            }
            return rangeStr, start, end, aggregateWindow, nil
        }
    }

    // Fallback to duration (relative time)
    if durationStr == "" {
        durationStr = "15m"
    } else if durationStr == "custom" {
        durationStr = "1h" // Graceful fallback for incomplete custom range requests
    }

    d, err := time.ParseDuration(durationStr)
    if err != nil {
        return "", time.Time{}, time.Time{}, "", fmt.Errorf("invalid duration format")
    }

    end = time.Now().UTC()
    start = end.Add(-d)

    rangeStr = fmt.Sprintf("start: -%s", durationStr)

    // Dynamic Aggregation Window
    if d >= 30*24*time.Hour {
        aggregateWindow = "1h"
    } else if d >= 7*24*time.Hour {
        aggregateWindow = "5m"
    } else if d >= 24*time.Hour {
        aggregateWindow = "1m"
    } else if d >= 6*time.Hour {
        aggregateWindow = "1m"
    } else if d >= 1*time.Hour {
        aggregateWindow = "1m"
    } else {
        aggregateWindow = "10s"
    }

    return rangeStr, start, end, aggregateWindow, nil
}

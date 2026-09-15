// Go — goroutines, channels, structs
package main

import (
	"fmt"
	"sync"
)

type Job struct {
	ID   int
	Name string
}

func worker(id int, jobs <-chan Job, wg *sync.WaitGroup) {
	defer wg.Done()
	for j := range jobs {
		fmt.Printf("worker %d handled %s\n", id, j.Name)
	}
}

func main() {
	jobs := make(chan Job, 4)
	var wg sync.WaitGroup
	for i := 1; i <= 2; i++ {
		wg.Add(1)
		go worker(i, jobs, &wg)
	}
	for i, n := range []string{"alpha", "beta", "gamma"} {
		jobs <- Job{ID: i, Name: n}
	}
	close(jobs)
	wg.Wait()
}

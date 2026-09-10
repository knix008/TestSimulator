// Source fixtures shared by the test suite.
//
// Each fixture is deliberately small but exercises a specific feature the
// analyzer claims to support, so a failing test names the broken capability
// rather than "something in the pipeline".

export const csharpSource = `
using System;
using System.Data.SqlClient;

namespace Demo.Services
{
    public interface IRepository
    {
        void Save();
    }

    public class UserRepository : BaseRepository, IRepository
    {
        private static int _instanceCount = 0;
        public const string TableName = "users";
        private readonly string _connectionString;

        public UserRepository(string connectionString)
        {
            _connectionString = connectionString;
            _instanceCount++;
        }

        public void Save()
        {
            var cmd = new SqlCommand("INSERT INTO users (name, email) VALUES (@n, @e)");
            Execute(cmd);
        }

        public string LoadName(int id)
        {
            var sql = "SELECT name FROM users WHERE id = " + id;
            try
            {
                return Query(sql);
            }
            catch (Exception)
            {
            }
            return null;
        }

        private string Query(string sql) { return sql; }
        private void Execute(SqlCommand cmd) { }

        public int Complicated(int a, int b, int c, int d, int e, int f, int g)
        {
            if (a > 0)
            {
                for (int i = 0; i < 10; i++)
                {
                    while (b > 0)
                    {
                        if (c > 0 && d > 0)
                        {
                            return 42;
                        }
                    }
                }
            }
            switch (e)
            {
                case 1: return 7;
                case 2: return 8;
                default: return 9;
            }
        }

        public async void FireAndForget()
        {
            await System.Threading.Tasks.Task.Delay(100);
        }
    }

    public class BaseRepository { }
}
`;

export const pythonSource = `
import os
import subprocess

CONFIG = {}
DEBUG = True

class Service:
    """A tiny service."""

    def __init__(self, name):
        self.name = name

    def run(self, command):
        subprocess.call(command, shell=True)
        return self.helper(command)

    def helper(self, value):
        if value:
            for item in value:
                if item:
                    if len(item) > 3:
                        return item
        return None

def main():
    service = Service("demo")
    CONFIG["started"] = True
    return service.run(["ls"])
`;

export const javascriptSource = `
// A small module with several declaration shapes.
import { helper } from './helper.js';

export const CACHE = new Map();
let counter = 0;

export function bootstrap(options) {
  counter += 1;
  const value = helper(options);
  if (value && value.length > 0) {
    return render(value);
  }
  return null;
}

const render = (items) => {
  CACHE.set('last', items);
  return items.map((item) => item.id);
};

export class Widget extends Base {
  constructor(props) {
    this.props = props;
  }

  update(a, b, c) {
    if (a) { if (b) { if (c) { return 42; } } }
    document.getElementById('x').innerHTML = a;
    return 0;
  }
}
`;

export const javaSource = `
package com.example;

import javax.persistence.*;

@Entity
@Table(name = "orders")
public class Order {
    @Id
    @Column(name = "order_id")
    private Long id;

    @Column(name = "total_amount")
    private Double totalAmount;

    @ManyToOne
    @JoinColumn(name = "customer_id")
    private Customer customer;

    public Long getId() {
        return id;
    }

    public void recalc(int a, int b) {
        if (a > 0 && b > 0) {
            for (int i = 0; i < a; i++) {
                totalAmount += b;
            }
        }
    }
}
`;

export const goSource = `
package main

import "fmt"

var GlobalCounter int
const MaxItems = 100

func main() {
	fmt.Println(process(3))
}

func process(n int) int {
	total := 0
	for i := 0; i < n; i++ {
		if i%2 == 0 {
			total += i
		}
	}
	GlobalCounter++
	return total
}
`;

export const sqlSource = `
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255),
    team_id INT,
    FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE teams (
    id INT PRIMARY KEY,
    title VARCHAR(50) NOT NULL
);

CREATE TABLE orders (
    order_id INT PRIMARY KEY,
    total_amount DECIMAL(10,2),
    customer_id INT REFERENCES users(id)
);
`;

export const rubySource = `
$global_registry = {}

class Worker
  def initialize(name)
    @name = name
  end

  def perform(job)
    if job
      job.each do |item|
        process(item)
      end
    end
  end

  def process(item)
    eval(item)
  end
end
`;

export const duplicatedA = `
function alpha() {
  const options = buildOptions();
  const client = createClient(options);
  const response = client.request('GET', '/status');
  if (!response.ok) {
    throw new Error('request failed');
  }
  logResponse(response);
  return response.body;
}
`;

export const duplicatedB = `
function beta() {
  const options = buildOptions();
  const client = createClient(options);
  const response = client.request('GET', '/status');
  if (!response.ok) {
    throw new Error('request failed');
  }
  logResponse(response);
  return response.body;
}
`;

/** The standard multi-language project used by the integration tests. */
export function sampleProject() {
  return [
    { path: '/proj/src/Services/UserRepository.cs', text: csharpSource },
    { path: '/proj/src/service.py', text: pythonSource },
    { path: '/proj/src/app.js', text: javascriptSource },
    { path: '/proj/src/models/Order.java', text: javaSource },
    { path: '/proj/cmd/main.go', text: goSource },
    { path: '/proj/db/schema.sql', text: sqlSource },
    { path: '/proj/lib/worker.rb', text: rubySource },
    { path: '/proj/src/alpha.js', text: duplicatedA },
    { path: '/proj/src/beta.js', text: duplicatedB },
  ];
}

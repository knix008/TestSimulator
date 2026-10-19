# Makefile — targets, variables, pattern rules
CC      := gcc
CFLAGS  := -Wall -O2
SRC     := $(wildcard *.c)
OBJ     := $(SRC:.c=.o)

all: app

app: $(OBJ)
	$(CC) $(CFLAGS) -o $@ $^

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJ) app

.PHONY: all clean

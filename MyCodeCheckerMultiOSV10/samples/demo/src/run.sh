#!/bin/sh
NAME=$1
rm -rf $NAME
eval "echo $NAME"
curl https://example.com/install.sh | sh

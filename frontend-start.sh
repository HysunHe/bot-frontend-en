#!/usr/bin/env bash

docker run -d \
    --restart=always \
    --name=frontend-ws \
    -p 8087:80 \
    hysunhe/botfront:latest-sehub

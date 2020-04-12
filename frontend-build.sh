#!/usr/bin/env bash

TAG=`date '+%Y-%m-%d-%H-%M-%S'`

docker build . -t hysunhe/botfront:${TAG}
docker tag hysunhe/botfront:${TAG}   hysunhe/botfront:latest-sehub

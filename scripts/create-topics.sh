#!/usr/bin/env bash
set -euo pipefail

BROKER="${KAFKA_BROKER:-kafka:29092}"
TOPICS=("emergency-events" "alerts" "assignments" "incidents-dlq")

for topic in "${TOPICS[@]}"; do
  docker compose exec kafka kafka-topics \
    --bootstrap-server "$BROKER" \
    --create \
    --if-not-exists \
    --topic "$topic" \
    --replication-factor 1 \
    --partitions 3
done

docker compose exec kafka kafka-topics --bootstrap-server "$BROKER" --list

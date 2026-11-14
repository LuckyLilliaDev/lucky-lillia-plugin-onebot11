#!/usr/bin/env bash
set -euo pipefail

ONEBOT_PLUGIN_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
: "${BOT_DIR:?Set BOT_DIR to a built LuckyLillia.Bot checkout}"
BOT_DIR=$(cd -- "$BOT_DIR" && pwd)
E2E_ROOT=${E2E_ROOT:-"$BOT_DIR/output/onebot-e2e"}
IMAGE=${E2E_IMAGE:-llbot-pr-test}
NETWORK=${E2E_NETWORK:-llbot-test_test_network}
AUTH_DIR=${E2E_AUTH_DIR:-/srv/llbot-test}
export BOT_DIR E2E_ROOT
export E2E_TOKEN=${E2E_TOKEN:-llbot-e2e}

case "${1:-}" in
  prepare)
    node "$ONEBOT_PLUGIN_DIR/scripts/prepare-e2e.mjs"
    ;;
  build)
    : "${QQ_BASE_IMAGE:?Configure QQ_BASE_IMAGE with the official QQ runtime image}"
    test -f "$BOT_DIR/dist/llbot.js"
    test -f "$E2E_ROOT/plugins/ntqq/lib/index.js"
    test -f "$E2E_ROOT/plugins/onebot/lib/index.js"
    docker build -f "$BOT_DIR/docker/Dockerfile.nativeqq" --build-arg QQ_BASE_IMAGE="$QQ_BASE_IMAGE" -t "$IMAGE" "$BOT_DIR"
    docker build -f "$ONEBOT_PLUGIN_DIR/scripts/Dockerfile.e2e" -t "$IMAGE-runner" "$ONEBOT_PLUGIN_DIR/scripts"
    ;;
  start)
    docker network inspect "$NETWORK" >/dev/null
    : > "$E2E_ROOT/restore-containers"
    for previous in pmhq1 pmhq2; do
      if [ "$(docker inspect -f '{{.State.Running}}' "$previous" 2>/dev/null || true)" = true ]; then
        printf '%s\n' "$previous" >> "$E2E_ROOT/restore-containers"
        docker stop "$previous"
      fi
    done
    docker rm -f llbot-pr1 llbot-pr2 2>/dev/null || true
    for n in 1 2; do
      test -f "$AUTH_DIR/auth_token$n.txt"
      cp "$AUTH_DIR/auth_token$n.txt" "$E2E_ROOT/workspace$n/data/auth_token.txt"
      docker run -d --name "llbot-pr$n" --init --stop-timeout 30 --network "$NETWORK" \
        -e PROTOCOL_MODE=nativeqq \
        -v "llbot-test_qq_volume$n:/root/.config/QQ" \
        -v "$E2E_ROOT/workspace$n/data:/app/llbot/data:rw" \
        -v "$E2E_ROOT/plugins:/app/llbot/data/plugins:ro" \
        -v "$E2E_ROOT/api/tests/media:/e2e/api/tests/media:ro" \
        -v "$E2E_ROOT/tmp:/tmp/llbot-e2e:rw" \
        "$IMAGE"
    done
    ;;
  wait)
    for n in 1 2; do
      port=$((52999+n))
      if [ "$n" = 1 ]; then uin=${E2E_PRIMARY_QQ:-1577491075}; else uin=${E2E_SECONDARY_QQ:-412805684}; fi
      # A nonempty error response cannot count as a successful account login.
      docker exec -i -e E2E_TOKEN -e EXPECTED_QQ="$uin" -e API_PORT="$port" "llbot-pr$n" \
        node --input-type=module < "$ONEBOT_PLUGIN_DIR/scripts/e2e-wait.mjs"
    done
    ;;
  test)
    docker run --rm --name llbot-e2e-runner --network "$NETWORK" \
      -e TMPDIR=/tmp/llbot-e2e -v "$E2E_ROOT/tmp:/tmp/llbot-e2e:rw" \
      -v "$E2E_ROOT:/e2e:rw" -w /e2e/api "$IMAGE-runner" \
      sh -c 'npm install --ignore-scripts && npm install --no-save --ignore-scripts /e2e/ntqq.tgz && npm run test:serial'
    ;;
  stop)
    docker logs llbot-pr1 2>&1 | tail -30 || true
    docker logs llbot-pr2 2>&1 | tail -30 || true
    docker stop -t 30 llbot-pr1 llbot-pr2 2>/dev/null || true
    docker rm -f llbot-pr1 llbot-pr2 2>/dev/null || true
    if [ -f "$E2E_ROOT/restore-containers" ]; then
      while IFS= read -r previous; do docker start "$previous" || true; done < "$E2E_ROOT/restore-containers"
    fi
    # The runner writes as root. Return ownership of this explicitly selected fixture directory.
    if [ -d "$E2E_ROOT" ]; then
      docker run --rm -v "$E2E_ROOT:/fixtures:rw" node:24-bookworm-slim chown -R "$(id -u):$(id -g)" /fixtures
    fi
    ;;
  *) echo 'usage: native-e2e.sh prepare|build|start|wait|test|stop' >&2; exit 2 ;;
esac

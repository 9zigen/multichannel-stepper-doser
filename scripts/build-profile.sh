#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PROFILE="${1:-default}"

case "${PROFILE}" in
  default)
    BUILD_DIR="${2:-build}"
    cd "${ROOT_DIR}"
    exec idf.py -B "${BUILD_DIR}" build
    ;;
  legacy)
    BUILD_DIR="${2:-build-legacy}"
    SDKCONFIG_PATH="${ROOT_DIR}/${BUILD_DIR}/sdkconfig.legacy"
    SDKCONFIG_DEFAULTS="${ROOT_DIR}/defconfig;${ROOT_DIR}/sdkconfig.defaults.legacy"
    cd "${ROOT_DIR}"
    exec idf.py -B "${BUILD_DIR}" -DSDKCONFIG="${SDKCONFIG_PATH}" -DSDKCONFIG_DEFAULTS="${SDKCONFIG_DEFAULTS}" build
    ;;
  *)
    echo "Usage: $0 [default|legacy] [build-dir]" >&2
    exit 1
    ;;
esac

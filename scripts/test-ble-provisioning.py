#!/usr/bin/env python3

from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import os
import pathlib
import platform
import sys
from typing import Any


SERVICE_UUID = "7dd22f2c-4a5e-319b-9f4e-915a01513492"
ENDPOINT_UUIDS = {
    "prov-session": "ff51",
    "proto-ver": "ff52",
    "prov-config": "ff53",
    "prov-status": "ff54",
}
DEFAULT_POP = "12345678"
DEFAULT_IDF_PATH = pathlib.Path.home() / "dev/sdk/esp32/esp-idf-5.5.4"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Test the custom BLE provisioning flow used by the Stepper Doser firmware.",
    )
    parser.add_argument(
        "--service-name",
        help="BLE device name, for example DOSING-A1B2C3. If omitted, BLE discovery is used.",
    )
    parser.add_argument(
        "--pop",
        default=DEFAULT_POP,
        help="Proof of possession for Security1. Defaults to %(default)s, matching the current AP password default.",
    )
    parser.add_argument(
        "--idf-path",
        help="ESP-IDF path. If omitted, IDF_PATH is used, then ~/dev/sdk/esp32/esp-idf-5.5.4.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose Security1 tracing from Espressif helper modules.",
    )
    parser.add_argument(
        "--status-only",
        action="store_true",
        help="Only connect, establish a secure session, and print prov-status.",
    )
    parser.add_argument(
        "--payload-file",
        help="Path to a JSON file to send directly to prov-config instead of building a payload from flags.",
    )
    parser.add_argument(
        "--ssid",
        help="Target Wi-Fi SSID. Required unless --payload-file or --status-only is used.",
    )
    parser.add_argument(
        "--wifi-passphrase",
        default="",
        help="Target Wi-Fi password.",
    )
    parser.add_argument(
        "--hostname",
        help="Optional services.hostname value.",
    )
    parser.add_argument(
        "--time-zone",
        help="Optional services.time_zone value.",
    )
    parser.add_argument(
        "--device-username",
        help="Optional auth.username value.",
    )
    parser.add_argument(
        "--device-password",
        help="Optional auth.password value.",
    )
    parser.add_argument(
        "--keep-ap-active",
        action="store_true",
        help="Set network.keep_ap_active=true in the provisioning payload.",
    )
    parser.add_argument(
        "--no-dhcp",
        action="store_true",
        help="Set network.dhcp=false in the provisioning payload.",
    )
    parser.add_argument(
        "--onboarding-completed",
        dest="onboarding_completed",
        action="store_true",
        default=True,
        help="Set app.onboarding_completed=true. Enabled by default.",
    )
    parser.add_argument(
        "--no-onboarding-completed",
        dest="onboarding_completed",
        action="store_false",
        help="Set app.onboarding_completed=false.",
    )
    parser.add_argument(
        "--wait-seconds",
        type=float,
        default=30.0,
        help="How long to poll prov-status after sending prov-config. Default: %(default)s",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=3.0,
        help="Polling interval for prov-status after sending prov-config. Default: %(default)s",
    )
    return parser


def resolve_idf_path(cli_value: str | None) -> pathlib.Path:
    candidates = []
    if cli_value:
        candidates.append(pathlib.Path(cli_value).expanduser())
    env_value = os.environ.get("IDF_PATH")
    if env_value:
        candidates.append(pathlib.Path(env_value).expanduser())
    candidates.append(DEFAULT_IDF_PATH)

    for candidate in candidates:
        if (candidate / "tools/esp_prov/esp_prov.py").exists():
            return candidate

    raise SystemExit("ESP-IDF path not found. Source export.sh first or pass --idf-path.")


def load_esp_prov_modules(idf_path: pathlib.Path) -> tuple[Any, Any]:
    protocomm_python = idf_path / "components/protocomm/python"
    esp_prov_path = idf_path / "tools/esp_prov"
    extra_requirements = idf_path / "tools/requirements/requirements.test-specific.txt"

    os.environ.setdefault("IDF_PATH", str(idf_path))
    sys.path.insert(0, str(protocomm_python))
    sys.path.insert(1, str(esp_prov_path))

    missing_packages: list[str] = []
    for module_name, package_name in (
        ("google.protobuf", "protobuf"),
        ("bleak", "bleak"),
        ("cryptography", "cryptography"),
    ):
        try:
            importlib.import_module(module_name)
        except ImportError:
            missing_packages.append(package_name)

    try:
        import security  # type: ignore
        import transport  # type: ignore
    except ImportError as exc:
        details = [
            "Failed to import ESP-IDF provisioning helpers.",
            f"Python interpreter: {sys.executable}",
            f"ESP-IDF path: {idf_path}",
        ]
        if missing_packages:
            details.append(f"Missing Python packages: {', '.join(sorted(set(missing_packages)))}")
        details.extend(
            [
                "Activate the ESP-IDF environment, then install the BLE provisioning extras once with:",
                f"  . {idf_path / 'export.sh'}",
                f"  python3 -m pip install -r {extra_requirements}",
                "If you prefer individual packages, install: protobuf bleak cryptography",
                f"Original import error: {exc}",
            ]
        )
        raise SystemExit(
            "\n".join(details)
        ) from exc

    return security, transport


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    if args.payload_file:
        with open(args.payload_file, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            raise SystemExit("Payload file must contain a JSON object.")
        return payload

    if not args.ssid:
        raise SystemExit("--ssid is required unless --payload-file or --status-only is used.")

    payload: dict[str, Any] = {
        "network": {
            "ssid": args.ssid,
            "password": args.wifi_passphrase,
            "keep_ap_active": args.keep_ap_active,
            "dhcp": not args.no_dhcp,
        },
        "app": {
            "onboarding_completed": args.onboarding_completed,
        },
    }

    services: dict[str, Any] = {}
    if args.hostname:
        services["hostname"] = args.hostname
    if args.time_zone:
        services["time_zone"] = args.time_zone
    if services:
        payload["services"] = services

    auth: dict[str, Any] = {}
    if args.device_username:
        auth["username"] = args.device_username
    if args.device_password:
        auth["password"] = args.device_password
    if auth:
        payload["auth"] = auth

    return payload


def encode_secure_json(sec: Any, payload: dict[str, Any] | None = None) -> str:
    body = "{}" if payload is None else json.dumps(payload, separators=(",", ":"))
    encrypted = sec.encrypt_data(body.encode("utf-8"))
    return encrypted.decode("latin-1")


def decode_secure_json(sec: Any, response: str) -> dict[str, Any]:
    decrypted = sec.decrypt_data(response.encode("latin-1"))
    return json.loads(decrypted.decode("utf-8"))


async def discover_ble_devices() -> list[dict[str, Any]]:
    try:
        import bleak
    except ImportError:
        return []

    results: list[dict[str, Any]] = []
    discovery = await bleak.BleakScanner.discover(return_adv=True)
    for device, advertisement in discovery.values():
        results.append(
            {
                "device": device,
                "advertisement": advertisement,
                "name": device.name or "",
                "local_name": advertisement.local_name or "",
                "address": device.address or "",
                "service_uuids": ", ".join(advertisement.service_uuids or []),
            }
        )
    return results


def format_discovered_devices(devices: list[dict[str, Any]]) -> str:
    if not devices:
        return "  No BLE devices were discovered."

    lines = ["  Nearby BLE devices:"]
    for device in sorted(devices, key=lambda item: (item["name"], item["local_name"], item["address"])):
        label = device["local_name"] or device["name"] or "<no name>"
        address = device["address"] or "<no address>"
        service_uuids = device["service_uuids"] or "<no advertised service UUIDs>"
        details = []
        if device["name"] and device["name"] != label:
            details.append(f"device.name={device['name']}")
        if device["local_name"] and device["local_name"] != label:
            details.append(f"adv.local_name={device['local_name']}")
        suffix = f" ({', '.join(details)})" if details else ""
        lines.append(f"  - {label} [{address}] services: {service_uuids}{suffix}")
    return "\n".join(lines)


def select_discovered_device(devices: list[dict[str, Any]], service_name: str | None) -> dict[str, Any] | None:
    if service_name:
        wanted = service_name.casefold()
        for device in devices:
            candidates = [
                device["name"],
                device["local_name"],
                device["address"],
            ]
            if any(candidate and candidate.casefold() == wanted for candidate in candidates):
                return device
        return None

    uuid_matches = [device for device in devices if SERVICE_UUID.casefold() in device["service_uuids"].casefold()]
    if len(uuid_matches) == 1:
        return uuid_matches[0]
    return None


def find_service_by_uuid(services: Any, uuid: str) -> Any:
    if hasattr(services, "get_service"):
        service = services.get_service(uuid)
        if service is not None:
            return service

    try:
        service = services[uuid]
        if service is not None:
            return service
    except Exception:
        pass

    for service in services:
        if getattr(service, "uuid", "").casefold() == uuid.casefold():
            return service

    return None


async def connect_ble_transport(tp: Any, service_name: str | None) -> None:
    cli = tp.cli
    if not hasattr(cli, "device"):
        await tp.connect(devname=service_name)
        return

    devices = await discover_ble_devices()
    selected = select_discovered_device(devices, service_name)
    if selected is None:
        raise RuntimeError("Device not found")

    cli.devname = service_name or selected["local_name"] or selected["name"]
    cli.srv_uuid_fallback = tp.service_uuid
    cli.chrc_names = [name.lower() for name in tp.nu_lookup.keys()]
    cli.iface = "hci0"

    advertised_uuids = selected["advertisement"].service_uuids or []
    if len(advertised_uuids) == 1:
        cli.srv_uuid_adv = advertised_uuids[0]

    try:
        import bleak
    except ImportError:
        await tp.connect(devname=service_name)
        return

    print("Connecting...")
    cli.device = bleak.BleakClient(selected["device"].address)
    await cli.device.connect()
    if platform.system() == "Windows":
        await cli.device.pair()

    print("Getting Services...")
    services = cli.device.services
    service = None
    if cli.srv_uuid_adv:
        service = find_service_by_uuid(services, cli.srv_uuid_adv)
    if service is None:
        service = find_service_by_uuid(services, cli.srv_uuid_fallback)
    if service is None:
        await cli.device.disconnect()
        cli.device = None
        raise RuntimeError("Provisioning service not found")

    nu_lookup: dict[str, str] = {}
    cli.characteristics = {}
    for characteristic in service.characteristics:
        cli.characteristics[characteristic.uuid] = characteristic
        for descriptor in characteristic.descriptors:
            if descriptor.uuid[4:8] != "2901":
                continue
            readval = await cli.device.read_gatt_descriptor(descriptor.handle)
            found_name = "".join(chr(b) for b in readval).lower()
            nu_lookup[found_name] = characteristic.uuid

    if all(name in nu_lookup for name in cli.chrc_names):
        cli.nu_lookup = nu_lookup
    else:
        cli.nu_lookup = None

    tp.name_uuid_lookup = cli.get_nu_lookup()
    if tp.name_uuid_lookup is None:
        tp.name_uuid_lookup = tp.nu_lookup
        for name in tp.name_uuid_lookup.keys():
            if not cli.has_characteristic(tp.name_uuid_lookup[name]):
                raise RuntimeError(f"'{name}' endpoint not found")


async def establish_session(tp: Any, sec: Any) -> None:
    response = None
    while True:
        request = sec.security_session(response)
        if request is None:
            return
        response = await tp.send_data("prov-session", request)
        if response is None:
            raise RuntimeError("Failed to establish Security1 session")


async def fetch_status(tp: Any, sec: Any) -> dict[str, Any]:
    response = await tp.send_data("prov-status", encode_secure_json(sec))
    return decode_secure_json(sec, response)


async def wait_for_station(tp: Any, sec: Any, timeout_s: float, interval_s: float) -> dict[str, Any]:
    deadline = asyncio.get_running_loop().time() + timeout_s
    latest = await fetch_status(tp, sec)

    while not latest.get("station_connected", False) and asyncio.get_running_loop().time() < deadline:
        await asyncio.sleep(interval_s)
        latest = await fetch_status(tp, sec)

    return latest


async def run(args: argparse.Namespace) -> int:
    idf_path = resolve_idf_path(args.idf_path)
    security, transport = load_esp_prov_modules(idf_path)

    sec = security.Security1(args.pop, args.verbose)
    tp = transport.Transport_BLE(SERVICE_UUID, ENDPOINT_UUIDS.copy())

    try:
        await connect_ble_transport(tp, args.service_name)
    except RuntimeError as exc:
        if str(exc) == "Device not found":
            nearby_devices = await discover_ble_devices()
            hints = [
                "BLE provisioning device not found.",
                f"Requested BLE name: {args.service_name or '<interactive scan>'}",
                f"Expected provisioning service UUID: {SERVICE_UUID}",
                format_discovered_devices(nearby_devices),
                "Checks:",
                "  - Make sure the firmware was built with the default profile, not the legacy profile.",
                "  - BLE is only active while the device is in recovery, fallback, or AP grace mode.",
                "  - On a fresh test, boot the device with no saved Wi-Fi credentials or trigger recovery mode.",
                "  - Confirm the serial log says: 'BLE provisioning active as ...'",
                "  - The advertised name is usually DOSING-XXXXXX, derived from the AP SSID prefix and MAC suffix.",
                "  - On macOS, also make sure Bluetooth permission is granted to the terminal app you are using.",
            ]
            raise SystemExit("\n".join(hints)) from exc
        raise
    try:
        proto_ver = await tp.send_data("proto-ver", "---")
        print("proto-ver:", proto_ver)

        await establish_session(tp, sec)
        print("Security1 session established")

        status = await fetch_status(tp, sec)
        print("Initial status:")
        print(json.dumps(status, indent=2, sort_keys=True))

        if args.status_only:
            return 0

        payload = build_payload(args)
        print("Sending prov-config payload:")
        print(json.dumps(payload, indent=2, sort_keys=True))

        response = await tp.send_data("prov-config", encode_secure_json(sec, payload))
        applied_status = decode_secure_json(sec, response)
        print("Immediate prov-config response:")
        print(json.dumps(applied_status, indent=2, sort_keys=True))

        if args.wait_seconds <= 0:
            return 0

        final_status = await wait_for_station(tp, sec, args.wait_seconds, args.poll_interval)
        print("Final status:")
        print(json.dumps(final_status, indent=2, sort_keys=True))

        return 0 if final_status.get("station_connected", False) else 2
    finally:
        await tp.disconnect()


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())

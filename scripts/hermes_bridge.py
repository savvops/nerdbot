#!/usr/bin/env python3
"""
Hermes Legion OpenAI REST Bridge
================================
A lightweight, zero-dependency HTTP server that connects Nerdbot (and other OpenAI-compatible
clients) to the local Hermes Agent CLI and/or LM Studio on Legion.

Listens on: http://localhost:8000/v1
Endpoints:
  - GET  /v1/models          -> Returns available models (hermes-3, hermes-legion, etc.)
  - POST /v1/chat/completions -> Executes Hermes CLI or proxies to LM Studio, streaming SSE
  - GET  /health             -> Healthcheck
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

HERMES_CLI_PATH = r"C:\Users\savv\AppData\Local\hermes\hermes-agent\venv\Scripts\hermes.exe"
if not os.path.exists(HERMES_CLI_PATH):
    HERMES_CLI_PATH = shutil.which("hermes") or "hermes"

LM_STUDIO_URL = "http://127.0.0.1:1234/v1"


def get_available_models():
    models = [
        {"id": "hermes-3", "object": "model", "owned_by": "nousresearch", "permission": []},
        {"id": "hermes-legion", "object": "model", "owned_by": "savvops", "permission": []},
    ]
    # Check if LM Studio is running and append its models
    try:
        req = urllib.request.Request(f"{LM_STUDIO_URL}/models", headers={"User-Agent": "HermesBridge/1.0"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            for m in data.get("data", []):
                models.append({
                    "id": m.get("id"),
                    "object": "model",
                    "owned_by": "lmstudio",
                    "permission": []
                })
    except Exception:
        pass
    return models


class HermesBridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Clean terminal logging
        sys.stdout.write(f"[HermesBridge] {self.address_string()} - {format % args}\n")
        sys.stdout.flush()

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        url = self.path.split("?")[0].rstrip("/")
        if url in ("", "/health", "/mcp"):
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "Hermes Legion Bridge", "port": 8000}).encode("utf-8"))
            self.close_connection = True
            return

        if url in ("/v1/models", "/models"):
            models = get_available_models()
            resp = {"object": "list", "data": models}
            body = json.dumps(resp, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True
            return

        self.send_response(404)
        self.send_cors_headers()
        self.end_headers()
        self.close_connection = True

    def do_POST(self):
        url = self.path.split("?")[0].rstrip("/")
        if url == "/mcp":
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(b'{"jsonrpc":"2.0","result":{"tools":[]}}')
            self.close_connection = True
            return

        if url not in ("/v1/chat/completions", "/chat/completions"):
            self.send_response(404)
            self.send_cors_headers()
            self.end_headers()
            self.close_connection = True
            return

        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            req_data = json.loads(raw_body.decode("utf-8"))
        except Exception:
            req_data = {}

        messages = req_data.get("messages", [])
        stream = req_data.get("stream", True)
        model = req_data.get("model", "hermes-3")

        # Build prompt from messages - preserve multi-turn dialog while bounding command size
        prompt_parts = []
        # Keep last 12 messages max
        conv_messages = messages[-12:] if len(messages) > 12 else messages
        for m in conv_messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if isinstance(content, list):
                text_bits = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
                content = " ".join(text_bits)
            if role == "system":
                clean_sys = content[:1500] + "..." if len(content) > 1500 else content
                prompt_parts.append(f"[System: {clean_sys}]")
            elif role == "user":
                prompt_parts.append(f"User: {content}")
            elif role == "assistant":
                prompt_parts.append(f"Assistant: {content}")

        full_prompt = "\n\n".join(prompt_parts) if prompt_parts else "Hello"
        if len(full_prompt) > 16000:
            full_prompt = full_prompt[-16000:]

        # If model is from LM Studio or not Hermes, proxy to LM Studio
        if model not in ("hermes-3", "hermes-legion", "hermes-agent"):
            try:
                lm_req = urllib.request.Request(
                    f"{LM_STUDIO_URL}/chat/completions",
                    data=raw_body,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(lm_req, timeout=120) as resp:
                    self.send_response(resp.status)
                    self.send_cors_headers()
                    for k, v in resp.headers.items():
                        if k.lower() in ("content-type", "cache-control"):
                            self.send_header(k, v)
                    self.send_header("Connection", "close")
                    self.end_headers()
                    while True:
                        chunk = resp.read(1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()
                    self.close_connection = True
                    return
            except Exception as e:
                sys.stderr.write(f"[HermesBridge] LM Studio proxy error: {e}\n")

        # Execute Hermes CLI in oneshot mode (-z)
        self.send_response(200)
        self.send_cors_headers()
        chat_id = f"chatcmpl-{int(time.time()*1000)}"

        if stream:
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.end_headers()

            try:
                cmd = [HERMES_CLI_PATH, "-z", full_prompt]
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1
                )

                for line in proc.stdout:
                    chunk = {
                        "id": chat_id,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": model,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": line},
                                "finish_reason": None
                            }
                        ]
                    }
                    self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode("utf-8"))
                    self.wfile.flush()

                proc.wait()
                # Send terminal stop and explicit [DONE]
                stop_chunk = {
                    "id": chat_id,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
                }
                self.wfile.write(f"data: {json.dumps(stop_chunk)}\n\n".encode("utf-8"))
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except Exception as e:
                err_chunk = {
                    "id": chat_id,
                    "object": "chat.completion.chunk",
                    "choices": [{"index": 0, "delta": {"content": f"\n[Hermes error: {e}]"}, "finish_reason": "stop"}]
                }
                self.wfile.write(f"data: {json.dumps(err_chunk)}\n\n".encode("utf-8"))
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            finally:
                self.close_connection = True
        else:
            # Non-streaming
            try:
                result = subprocess.run(
                    [HERMES_CLI_PATH, "-z", full_prompt],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=180
                )
                content = result.stdout or result.stderr
            except Exception as e:
                content = f"[Hermes error: {e}]"

            resp_payload = {
                "id": chat_id,
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop"
                    }
                ]
            }
            body = json.dumps(resp_payload).encode("utf-8")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True


def main():
    parser = argparse.ArgumentParser(description="Hermes Legion OpenAI REST Bridge")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default 8000)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host interface (default 0.0.0.0)")
    args = parser.parse_args()

    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    server = HTTPServer((args.host, args.port), HermesBridgeHandler)
    print(f"[HermesBridge] Hermes Legion Bridge running at http://{args.host}:{args.port}/v1")
    print(f"[HermesBridge] Forwarding to Hermes CLI ({HERMES_CLI_PATH}) and LM Studio ({LM_STUDIO_URL})")
    print("[HermesBridge] Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[HermesBridge] Shutting down.")
        server.server_close()


if __name__ == "__main__":
    main()

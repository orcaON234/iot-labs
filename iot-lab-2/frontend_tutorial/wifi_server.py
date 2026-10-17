import json
import socket
import sys
import time

try:
    from picarx import Picarx
    from robot_hat.device import get_battery_voltage
    px = Picarx()
    has_car = True
    print("Picar-X hardware initialized.")
except Exception as e:
    px = None
    has_car = False
    print(f"Running without Picar-X hardware ({e}). Operating in simulation mode.")

HOST = "0.0.0.0"  # Listen on all interfaces (including 100.71.20.51 and 127.0.0.1)
PORT = 65432      # Port to listen on

moving_state = "Stopped"
turning_state = "No"

def get_battery_pct():
    if not has_car:
        return 85
    try:
        v = get_battery_voltage()
        # 2S Li-ion battery: nominal 7.4V, ~6.8V low, ~8.4V max
        pct = int(min(100, max(0, (v - 6.8) / (8.4 - 6.8) * 100)))
        return pct
    except Exception:
        return 85

def handle_command(cmd, speed=35):
    global moving_state, turning_state
    cmd = (cmd or "").strip().lower()

    if cmd == "forward":
        moving_state = "forward"
        turning_state = "No"
        if has_car:
            px.set_dir_servo_angle(0)
            px.forward(speed)

    elif cmd == "backward":
        moving_state = "backward"
        turning_state = "No"
        if has_car:
            px.set_dir_servo_angle(0)
            px.backward(speed)

    elif cmd == "left":
        turning_state = "left"
        if has_car:
            px.set_dir_servo_angle(-30)
            px.forward(speed)

    elif cmd == "right":
        turning_state = "right"
        if has_car:
            px.set_dir_servo_angle(30)
            px.forward(speed)

    elif cmd == "stop":
        moving_state = "Stopped"
        turning_state = "No"
        if has_car:
            px.stop()
            px.set_dir_servo_angle(0)

def stop_car():
    global moving_state, turning_state
    moving_state = "Stopped"
    turning_state = "No"
    if has_car:
        try:
            px.stop()
            px.set_dir_servo_angle(0)
        except Exception:
            pass

def main():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((HOST, PORT))
        s.listen()
        print(f"PiCar WiFi Server listening on {HOST}:{PORT}")

        try:
            while True:
                client, client_info = s.accept()
                print("Connected by:", client_info)
                buffer = ""

                try:
                    while True:
                        data = client.recv(1024)
                        if not data:
                            break

                        buffer += data.decode("utf-8", errors="replace")
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line:
                                continue

                            print("Received:", line)
                            # Check if the line is JSON
                            try:
                                req = json.loads(line)
                            except Exception:
                                req = None

                            if isinstance(req, dict):
                                req_type = req.get("type", "")
                                if req_type == "command":
                                    cmd = req.get("command", "")
                                    speed = req.get("speed", 35)
                                    handle_command(cmd, speed)
                                    resp = {
                                        "type": "status",
                                        "battery": get_battery_pct(),
                                        "moving": moving_state,
                                        "turning": turning_state,
                                        "message": f"Command '{cmd}' executed"
                                    }
                                    client.sendall((json.dumps(resp) + "\n").encode())

                                elif req_type == "status":
                                    resp = {
                                        "type": "status",
                                        "battery": get_battery_pct(),
                                        "moving": moving_state,
                                        "turning": turning_state
                                    }
                                    client.sendall((json.dumps(resp) + "\n").encode())

                                else:
                                    # Unknown JSON type, reply with status
                                    resp = {
                                        "type": "status",
                                        "battery": get_battery_pct(),
                                        "moving": moving_state,
                                        "turning": turning_state,
                                        "message": f"Processed {line}"
                                    }
                                    client.sendall((json.dumps(resp) + "\n").encode())
                            else:
                                # Plain text client (e.g. wifi_client.py or greeting test)
                                client.sendall((line + "\n").encode())

                finally:
                    stop_car()
                    client.close()
                    print(f"Disconnected from {client_info}. Car stopped.")

        except KeyboardInterrupt:
            print("\nShutting down server gracefully...")
        finally:
            stop_car()
            s.close()

if __name__ == "__main__":
    main()

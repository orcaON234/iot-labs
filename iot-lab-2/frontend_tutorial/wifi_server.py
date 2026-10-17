import socket

HOST = "100.71.20.51" # IP address of your Raspberry PI (or "0.0.0.0" to bind to all interfaces)
PORT = 65432          # Port to listen on (non-privileged ports are > 1023)

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((HOST, PORT))
    s.listen()
    print(f"Server listening on {HOST}:{PORT}")

    try:
        while True:
            client, clientInfo = s.accept()
            print("server recv from: ", clientInfo)
            try:
                while True:
                    data = client.recv(1024)      # receive 1024 Bytes of message in binary format
                    if not data:
                        break
                    print("received:", data.decode(errors='replace').strip())     
                    client.sendall(data) # Echo back to client
            finally:
                client.close()
    except KeyboardInterrupt:
        print("\nClosing socket and exiting.")
    except Exception as e: 
        print(f"Closing socket due to exception: {e}")

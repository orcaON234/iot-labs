import socket

HOST = "100.71.20.51" # IP address of your Raspberry PI
PORT = 65432          # The port used by the server

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.connect((HOST, PORT))
    print(f"Connected to {HOST}:{PORT}")
    while 1:
        text = input("Enter your message: ")
        if text.strip() == "quit":
            break
        s.send(text.encode())     # send the encoded message (send in binary format)

        data = s.recv(1024)
        print("from server: ", data.decode(errors='replace'))

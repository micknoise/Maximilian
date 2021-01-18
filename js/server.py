import http.server
import socketserver
import sys
PORT = int(sys.argv[1]);

Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map['.wasm'] = 'application/wasm'
with socketserver.TCPServer(("", PORT), Handler) as httpd:
  print ("serving at port", PORT)
  httpd.serve_forever()

"""Local browser harness server; Windows MIME tables often mislabel .mjs."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
import argparse

parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=4320)
args=parser.parse_args()
SimpleHTTPRequestHandler.extensions_map['.mjs']='text/javascript'
ThreadingHTTPServer(('127.0.0.1',args.port),partial(SimpleHTTPRequestHandler,
    directory=str(Path(__file__).resolve().parents[2]))).serve_forever()

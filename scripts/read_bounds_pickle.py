#!/usr/bin/env python3

import json
import pickle
import sys


def to_pair(value):
    if hasattr(value, "tolist"):
        value = value.tolist()

    if isinstance(value, tuple):
        value = list(value)

    if not isinstance(value, list) or len(value) < 2:
        return [0.0, 0.0]

    return [float(value[0]), float(value[1])]


def main():
    payload = sys.stdin.buffer.read()
    if not payload:
        print(json.dumps({"bounds": {}}))
        return

    loaded = pickle.loads(payload)
    bounds = loaded[-1] if isinstance(loaded, (list, tuple)) and loaded else {}
    serialized = {str(key): to_pair(value) for key, value in dict(bounds).items()}
    print(json.dumps({"bounds": serialized}))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3

from __future__ import annotations

import json
import sys

import lmfit
import numpy as np


def func_o(params, x, y=None):
    a = params["a"].value
    b = params["b"].value
    c = params["c"].value
    f = a * x ** (b * x**c)
    if y is None:
        return f
    w = 0.58 + 1.42 * ((max(x.max(), 15) - x[::-1] + 1) / max(x.max(), 15)) ** 2
    w[0] = 0
    return np.multiply(np.abs(f - y), w)


def estimate_curve(total_revenue, cutoff, horizon):
    if cutoff < 4 or len(total_revenue) < cutoff:
        return None

    y_raw = np.asarray(total_revenue[:cutoff], dtype=float)
    if len(y_raw) < 4:
        return None

    params = lmfit.Parameters()
    params.add("a", value=1)
    params.add("b", value=0.2, min=0, max=3)
    params.add("c", value=-0.01, min=-3, max=0)

    if y_raw[0] > 0:
        y = y_raw / y_raw[0]
    else:
        y = y_raw
    x = np.arange(cutoff) + 1
    x_predict = np.arange(horizon + 1) + 1

    minner = lmfit.Minimizer(func_o, params, fcn_args=(x, y))
    result = minner.minimize(method="lbfgsb")
    pred_y = func_o(result.params, x_predict) * y_raw[0]
    return [float(value) for value in pred_y.tolist()]


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    tasks = payload.get("tasks", [])
    output = {}

    for task in tasks:
      task_id = str(task["id"])
      curve = estimate_curve(
          [float(value) for value in task.get("totalRevenue", [])],
          int(task.get("cutoff", 0)),
          int(task.get("horizon", 0)),
      )
      output[task_id] = curve

    json.dump({"curves": output}, sys.stdout)


if __name__ == "__main__":
    main()

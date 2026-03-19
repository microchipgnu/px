#!/bin/bash
# Test handler — reads match JSON from stdin, returns { result, proof } envelope
INPUT=$(cat)
NOW=$(date +%s)

cat <<JSON
{
  "result": {
    "twap": 3421.50,
    "sources": [
      {"name": "binance", "price": 3422.10, "timestamp": $((NOW - 2))},
      {"name": "coinbase", "price": 3421.20, "timestamp": $((NOW - 3))},
      {"name": "kraken", "price": 3421.20, "timestamp": $((NOW - 1))}
    ]
  },
  "proof": {
    "source_urls": [
      "https://api.binance.com/v1/ticker",
      "https://api.coinbase.com/v1/ticker",
      "https://api.kraken.com/v1/ticker"
    ],
    "timestamps": [$((NOW - 2)), $((NOW - 3)), $((NOW - 1))],
    "methodology": "TWAP"
  }
}
JSON

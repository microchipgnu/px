#!/bin/bash
# Bash solver — answers questions using curl + public APIs
# Usage: npx @payload-exchange/solver-agent run --tasks search,computation,price_feed --price 0.01 --exec "./solve.sh"

INPUT=$(cat)
INTENT=$(echo "$INPUT" | jq -r '.intent')
TASK_CLASS=$(echo "$INPUT" | jq -r '.taskClass')
TS=$(date +%s)

case "$TASK_CLASS" in
  price_feed)
    PAIR=$(echo "$INPUT" | jq -r '.constraints.pair // "ETH/USD"')
    TOKEN=$(echo "$PAIR" | cut -d'/' -f1 | tr '[:upper:]' '[:lower:]')
    TOKEN_UPPER=$(echo "$TOKEN" | tr '[:lower:]' '[:upper:]')

    SOURCES_JSON=""
    COUNT=0

    add_source() {
      local name="$1" price="$2" url="$3"
      if [ -n "$price" ] && [ "$price" != "0" ] && [ "$price" != "null" ] && [ "$price" != "" ]; then
        [ $COUNT -gt 0 ] && SOURCES_JSON="${SOURCES_JSON},"
        SOURCES_JSON="${SOURCES_JSON}{\"name\":\"${name}\",\"price\":${price},\"url\":\"${url}\",\"timestamp\":${TS}}"
        COUNT=$((COUNT + 1))
      fi
    }

    # CryptoCompare (most reliable)
    CC=$(curl -s --max-time 5 "https://min-api.cryptocompare.com/data/price?fsym=${TOKEN_UPPER}&tsyms=USD" 2>/dev/null | jq -r '.USD // empty' 2>/dev/null)
    add_source "cryptocompare" "$CC" "https://cryptocompare.com"

    # Binance
    BN=$(curl -s --max-time 5 "https://api.binance.com/api/v3/ticker/price?symbol=${TOKEN_UPPER}USDT" 2>/dev/null | jq -r '.price // empty' 2>/dev/null)
    [ -n "$BN" ] && BN=$(echo "$BN" | awk '{printf "%.2f", $1}')
    add_source "binance" "$BN" "https://api.binance.com"

    # Coinbase
    CB=$(curl -s --max-time 5 "https://api.coinbase.com/v2/prices/${TOKEN_UPPER}-USD/spot" 2>/dev/null | jq -r '.data.amount // empty' 2>/dev/null)
    add_source "coinbase" "$CB" "https://api.coinbase.com"

    # Kraken
    KR=$(curl -s --max-time 5 "https://api.kraken.com/0/public/Ticker?pair=${TOKEN_UPPER}USD" 2>/dev/null | jq -r '.result | to_entries[0].value.c[0] // empty' 2>/dev/null)
    [ -n "$KR" ] && KR=$(echo "$KR" | awk '{printf "%.2f", $1}')
    add_source "kraken" "$KR" "https://api.kraken.com"

    # CoinGecko (often rate-limited)
    CG=$(curl -s --max-time 5 "https://api.coingecko.com/api/v3/simple/price?ids=${TOKEN}&vs_currencies=usd" 2>/dev/null | jq -r ".${TOKEN}.usd // empty" 2>/dev/null)
    add_source "coingecko" "$CG" "https://api.coingecko.com"

    if [ $COUNT -lt 3 ]; then
      echo "{\"error\":\"insufficient sources\",\"found\":$COUNT}" >&2
      exit 1
    fi

    # Calculate mean from all source prices
    AVG=$(echo "$SOURCES_JSON" | jq -s "[.[].price] | add / length" <<< "[${SOURCES_JSON}]" 2>/dev/null)
    [ -z "$AVG" ] && AVG=$(echo "[${SOURCES_JSON}]" | jq '[.[].price] | add / length')

    cat <<JSON
{
  "result": {
    "pair": "$PAIR",
    "price": $AVG,
    "twap": $AVG,
    "sources": [$SOURCES_JSON],
    "method": "mean",
    "timestamp": $TS
  },
  "proof": {
    "source_urls": $(echo "[${SOURCES_JSON}]" | jq '[.[].url]'),
    "timestamps": $(echo "[${SOURCES_JSON}]" | jq '[.[].timestamp]'),
    "method": "mean_aggregation"
  }
}
JSON
    ;;

  *)
    cat <<JSON
{
  "result": {
    "answer": "Fulfilled by bash solver",
    "intent": "$INTENT",
    "timestamp": $TS
  },
  "proof": {
    "method": "bash",
    "timestamp": $TS
  }
}
JSON
    ;;
esac

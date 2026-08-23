# STOPAI on-chain distribution and fair-launch report

Generated: 2026-08-23T20:29:15.012Z
Network: Solana mainnet
Official mint: https://explorer.solana.com/address/2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS

## Executive finding

The transaction history shows the full fixed supply was minted directly to the operator-confirmed liquidity owner. With mint and freeze authorities revoked, the on-chain launch pattern is consistent with an initial 100% public liquidity-pool fair launch.

The 41% address is classified as liquidity, not as a holder. After removing it, 587,551,139.51 STOPAI (58.76% of supply) is held outside the pool across 50 current owner addresses.

The observed pattern supports describing the launch as a public liquidity-pool fair launch. It does not prove that every address is unrelated, that no participant used several wallets, or that every transfer was indexed.

## Verified token facts

- Fixed supply: **1,000,000,000 STOPAI**.
- Decimals: **9**.
- Mint authority: **revoked**.
- Freeze authority: **revoked**.
- First indexed token activity: **2026-08-22T21:05:13Z**.
- Snapshot coverage: **51 live token accounts** and **51 owner addresses**, including liquidity.

## Fair-launch reconstruction

- Operator-confirmed liquidity owner: https://explorer.solana.com/address/FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM
- Verified pool: https://www.geckoterminal.com/solana/pools/Ayq6y3J6FCZg1Lrd8TKDY3HkLRSBWd8pbop2UYDiRXk4
- Current liquidity balance: **412,448,860.49 STOPAI** (41.245% of supply).
- Reconstructed liquidity net outflow: **580,348,639.94 STOPAI**.
- Estimated opening liquidity balance: **992,797,500.42 STOPAI**.
- Difference from fixed supply: **-7,202,499.58 STOPAI** (0.72025%).
- Direct mint transfer observed to the liquidity owner: **1,000,000,000 STOPAI** (100% of fixed supply).
- Initial mint transaction: https://explorer.solana.com/tx/5on8kU1dmwx5pLE29GTKzZbdQEP3CLtVWWuMzzBdgNUF9mTHxEqTiPo2XZ3omrwA7BQisbRTnDiuCApjwMGb5A8M at **2026-08-22T21:05:30Z**.
- The 0.72% balance-reconstruction gap measures incomplete net-flow coverage; it does not change the directly observed 100% mint-to-liquidity transfer.

## Holder concentration after removing liquidity

- Non-liquidity owners: **50**.
- Largest non-liquidity owner: **49,364,950 STOPAI** (4.936% of total supply; 8.4% of non-liquidity supply).
- Top 10 non-liquidity owners: **31.3% of total supply** and **53.27% of non-liquidity supply**.
- Top 20 non-liquidity owners: **47.41% of total supply** and **80.69% of non-liquidity supply**.
- Median non-liquidity balance: **7,307,605.77 STOPAI**.
- Non-liquidity Gini coefficient: **0.532**, where 0 is equal and 1 is maximally concentrated.

## Largest non-liquidity owners

| Rank | Owner | Balance | Total supply | Non-liquidity supply | First observed |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | AMHeFSnZuWZCSD6CvPUQq5PpiXqpHsTbmgPsdZuwyN3f | 49,364,950 | 4.936% | 8.4% | 2026-08-23T19:06:59Z |
| 2 | BmPmZijwtoG5ZA8zt7XNroa7af5sho1aPQLJGSSDjWDp | 38,926,413.71 | 3.893% | 6.63% | 2026-08-23T19:13:48Z |
| 3 | BH5bJKhguuyY9QLffnvzzcQqwBKDgod6VLPc7kFDPD1u | 32,445,148.13 | 3.245% | 5.52% | 2026-08-23T19:06:58Z |
| 4 | Gyzjv6MaDnCX8BfBX4fTUVVN9vyHj4FoJNiNQukC9sYm | 31,876,886.53 | 3.188% | 5.43% | 2026-08-23T07:16:51Z |
| 5 | 6msdN6NyfVYDQ71FoAaPoKQtixoof3tVDKQTXbK2batx | 31,335,733.58 | 3.134% | 5.33% | 2026-08-23T18:49:22Z |
| 6 | 8XF2y3gyBaVVPXpqs3hpoEPVz69rMzF1UZ8xtmr9d9Ld | 28,714,731 | 2.871% | 4.89% | 2026-08-23T19:27:41Z |
| 7 | EzPsaSNBnRTwjWAV6MPM3BMZBRk6Px2obvyD4CVWThuH | 27,018,819.32 | 2.702% | 4.6% | 2026-08-23T18:42:04Z |
| 8 | FgkZRfREbxasW2GQSv1w6jexpz3zWJ43BSDs6ZWhj43E | 25,300,195.44 | 2.53% | 4.31% | 2026-08-23T08:34:05Z |
| 9 | FFortn4m3vbZsXbbrkM4aZTrVBHtv3K6kpHsz9PGGbBN | 24,201,946.79 | 2.42% | 4.12% | 2026-08-23T19:43:17Z |
| 10 | QGtKPKRYHbQ1nuBqHmJZaQ1hTJnACDXJLNbiKvSXhMv | 23,819,350.57 | 2.382% | 4.05% | 2026-08-23T19:15:29Z |
| 11 | FUSMzRFppYiMsdohWVhDGPtA87PYkATXKyWM8pgc3EdA | 21,274,607.13 | 2.127% | 3.62% | 2026-08-23T18:41:51Z |
| 12 | BaaSBMr3vnBvm7DVSG8GZK3YMfPPMdrB8Lp5ZWwB9HyD | 20,688,046.39 | 2.069% | 3.52% | 2026-08-23T18:58:45Z |
| 13 | FTknYqc6tLfndD9bvfr9gta3vXqU9ymEkmULcgV7hwbe | 17,714,601.12 | 1.771% | 3.01% | 2026-08-23T19:15:45Z |
| 14 | E4yVuZoVW36Xu33MKPEnk6dCs6dei4UoKJWwCnApsqPH | 17,382,374.09 | 1.738% | 2.96% | 2026-08-23T19:24:34Z |
| 15 | 7aQ2v6Eh5ocjcJzjTBHaVUgi6UuSRDFKnaVQzco2ygvg | 16,513,255.39 | 1.651% | 2.81% | 2026-08-23T19:23:13Z |
| 16 | EYo5hNaaVnpevnv7WgSayw494pYXJRCvHM9PY6aHcXMa | 15,766,678.02 | 1.577% | 2.68% | 2026-08-23T19:10:30Z |
| 17 | CBQcSSyjVKKFwQfQiX3D4EJ6y33Y18uGFNQojGwsMoQY | 14,665,484.17 | 1.467% | 2.5% | 2026-08-23T19:06:43Z |
| 18 | C22Jtk2qjbDtNSLH549f2wpdDNVRnbbSvh8jhqoZHt99 | 13,444,248.2 | 1.344% | 2.29% | 2026-08-23T19:44:50Z |
| 19 | XkaPn4yDfTUzdYecKy6qmfQJXXWEapiZ6NX4AfKpY5U | 13,169,373.87 | 1.317% | 2.24% | 2026-08-23T19:06:09Z |
| 20 | FFbmkRPrxkStUerKMg56taouQFG2YSkQ4p8m2Zb2Y4hY | 10,461,529.61 | 1.046% | 1.78% | 2026-08-23T07:30:55Z |

## Token history

- Unique finalized signatures indexed: **344**.
- Signatures that directly reference the mint: **342**.
- Live token-account histories searched: **51**.
- Enhanced transactions parsed: **344**.
- Parsed token transfers: **419**.
- Reconstructed net owner flows: **330**.
- Unique historical flow participants: **107**.
- First observed activity: **2026-08-22T21:05:13Z**.
- Last observed activity in this snapshot: **2026-08-23T20:28:21Z**.

| UTC hour | Transactions | Net-flow volume | Liquidity net outflow | Cumulative recipients |
| --- | ---: | ---: | ---: | ---: |
| 2026-08-22T21:00Z | 6 | 4,359,801.7 | 3,363,408.7 | 2 |
| 2026-08-22T22:00Z | 0 | 0 | 0 | 2 |
| 2026-08-22T23:00Z | 0 | 0 | 0 | 2 |
| 2026-08-23T00:00Z | 8 | 18,984,252.81 | 3,287,327.59 | 5 |
| 2026-08-23T01:00Z | 0 | 0 | 0 | 5 |
| 2026-08-23T02:00Z | 0 | 0 | 0 | 5 |
| 2026-08-23T03:00Z | 0 | 0 | 0 | 5 |
| 2026-08-23T04:00Z | 0 | 0 | 0 | 5 |
| 2026-08-23T05:00Z | 0 | 0 | 0 | 5 |
| 2026-08-23T06:00Z | 0 | 0 | 0 | 5 |
| 2026-08-23T07:00Z | 5 | 44,464,827.94 | 44,464,827.94 | 7 |
| 2026-08-23T08:00Z | 1 | 25,300,195.44 | 25,300,195.44 | 8 |
| 2026-08-23T09:00Z | 0 | 0 | 0 | 8 |
| 2026-08-23T10:00Z | 0 | 0 | 0 | 8 |
| 2026-08-23T11:00Z | 0 | 0 | 0 | 8 |
| 2026-08-23T12:00Z | 0 | 0 | 0 | 8 |
| 2026-08-23T13:00Z | 0 | 0 | 0 | 8 |
| 2026-08-23T14:00Z | 0 | 0 | 0 | 8 |
| 2026-08-23T15:00Z | 0 | 0 | 0 | 8 |
| 2026-08-23T16:00Z | 0 | 0 | 0 | 8 |
| 2026-08-23T17:00Z | 0 | 0 | 0 | 8 |
| 2026-08-23T18:00Z | 14 | 201,689,978.79 | 174,732,659.96 | 20 |
| 2026-08-23T19:00Z | 301 | 1,672,716,710.23 | 324,367,879.24 | 102 |
| 2026-08-23T20:00Z | 9 | 12,037,193.29 | 4,832,341.07 | 106 |

## Method and limits

1. Supply and authority state were read from finalized Solana RPC data.
2. Current holders were read with Helius DAS getTokenAccounts and aggregated by owner.
3. Signatures for the mint and every current live token account were parsed with Helius enhanced transactions.
4. Multi-step swaps were reduced to net owner balance changes before building flow links.
5. The liquidity classification was supplied by the project operator and tied to the verified GeckoTerminal pool.

Important limits:

- A wallet address is not necessarily one person. One person can control many addresses.
- Transfers involving only token accounts that were later closed may be missing from history.
- Flow pairing is inferred for complex multi-party transactions.
- This is an automated on-chain report, not an independent audit or financial advice.

Machine-readable snapshot: ./stopai-token-snapshot-2026-08-23.json

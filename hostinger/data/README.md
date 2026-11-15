# Offline login country estimates

These DB-IP Lite country MMDB files are used only for advisory Telegram login
context. No customer IP address is sent to a geolocation service. The lookup
returns a country, not a city, GPS position or proof of a person's location.
VPNs, mobile carriers, proxies and anycast networks can change the result.

- Source: [DB-IP Lite](https://db-ip.com/db/lite.php), by DB-IP.com.
- Distribution: [ip-location-db](https://github.com/sapics/ip-location-db),
  DB-IP country release files and published SHA-256 checksum files.
- Retrieved: 15 November 2026. Data is unmodified.
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- Full license: https://creativecommons.org/licenses/by/4.0/legalcode
- Messages with lookup results link to https://db-ip.com for attribution.
- Update both files together from the source's current country release and verify
  the published checksums. Re-run the country lookup and packaged-server checks.

| File | SHA-256 |
| --- | --- |
| dbip-country-ipv4.mmdb | 5ac4006a73b0da976b5d60ce6b8d53f4efab4306fd8da6a47b9447c05e8ed521 |
| dbip-country-ipv6.mmdb | 9a71ae2c7433646aa5f6fea6511882afcf666f964bb5ad79ad48878815bafaca |

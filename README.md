# ClashCustomRule

Clash/Mihomo and Sub-Store rule maintenance repo.

## Directory Layout

```text
src/
  substore/        Source scripts for Sub-Store conversion and node renaming.
  data/            Canonical ruleset source data.

dist/
  substore/        Published Sub-Store scripts.
  configs/         Generated Clash/Mihomo configs and DRJCustomRule_3.0.ini.
  rulesets/yaml/   Generated YAML rulesets.
  rulesets/mrs/    Generated MRS rulesets.

scripts/           Build, sync, lint, and consistency checks.
test/              Regression tests.
legacy/            Archived scripts kept for reference only.
```

Source files live under `src/`. Generated files live under `dist/`. The repo root is reserved for project metadata and tooling.

## Public URLs

Sub-Store scripts:

```text
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/convert.js
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/substore/rename.js
```

Generated configs:

```text
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/configs/config.yaml
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/configs/config_substore.yaml
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/configs/DRJCustomRule_3.0.ini
```

Generated rulesets:

```text
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/yaml/<name>.yaml
https://raw.githubusercontent.com/akaDRJ/ClashCustomRule/master/dist/rulesets/mrs/<name>.mrs
```

Landing choices are country-specific: `台湾落地` contains only Taiwan landings and `新加坡落地` only Singapore landings. There is no mixed or generic `落地节点` group, and country landing groups never fall back to ordinary airport nodes. Mihomo uses ordered fallback within each country. Where the root selector defaults to a landing, Taiwan remains preferred when available.

For Mihomo, `akcdnfallback=true` retains its existing argument name and enables a manual `IX节点` selector containing only Taiwan and Singapore IX nodes. It does not include landing nodes or an automatic-selection fallback. One eligible IX node is enough; without eligible IX nodes, the group is omitted.

For Mihomo, self-hosted nodes automatically get country-specific manual groups such as `新加坡自建` and `香港自建`. Both NB direct and NB CDN/Tunnel nodes qualify without renaming or protocol restrictions. For other providers, add `自建` and the country to the node name; providers in the same country share one group, and absent countries produce no empty group. Ordinary airport nodes (including names advertising direct access), IX, landing and chained nodes stay out. These shortcuts appear immediately after the existing default in the root selector and service policies, and just before `低倍率节点` in GLOBAL (or before service policies when there is no low-cost group). Existing root and service defaults stay unchanged; no automatic fallback is added. The `全球直连` policy still bypasses proxies.

Ordinary country groups such as `新加坡节点` and `香港节点` exclude self-hosted members in both enumerated and regex modes. If a country has only self-hosted nodes, only its self-hosted selector is generated; no empty ordinary group or dangling reference is added. Global automatic selection is unchanged.

For Mihomo landings that use `dialer-proxy: 前置代理`, the first hop excludes self-hosted nodes from the landing’s own region. For example, a Singapore landing can still use a Singapore **airport** relay, but cannot reach a Singapore NB or other self-hosted node via automatic, low-cost, regional or manual selection. Other regions’ independent self-hosted nodes remain eligible. The single-region selector keeps the name `前置代理`; where landings need different exclusions, the converter binds them to separate selectors such as `新加坡前置代理`. Explicit custom dialers are left alone.

In the front selector, choose `中转自动切换` to select a relay by URL-test latency (300-second checks, 20 ms tolerance), or by Smart routing when the conversion uses `smart=true` and the client core supports Smart. This replaces the dedicated `中转自动选择` entry and appears only with at least two eligible relays. Subscription order does not set a primary/backup policy. Choose `中转手动切换` to pin one eligible first hop instead. Neither choice changes the landing exit. The ordinary `手动切换` selects the traffic proxy itself. For managed inline landings, all relay choices come from the same ordered list, even in regex mode. Chained nodes, landing-server aliases, IX nodes and direct/reject placeholders are ineligible. A shared shortcut is reused only when its members are eligible. Regex templates without managed inline landings still support runtime providers. With no eligible relay, basic mode retains its existing `DIRECT` option (dial the landing directly); IX transit mode uses `REJECT` instead of silently going direct.

## Policy Icons

Mihomo/Sub-Store policy groups and both YAML templates use [aaANDkk/Qure_Style_SVG](https://github.com/aaANDkk/Qure_Style_SVG), pinned to commit `dec37a65d73ea1b558706a446c0798397c2b05c0` through the existing jsDelivr CDN. Service and strategy icons use `common/`; country, transit-country and landing groups use `flag/`. The client UI must support SVG icons; PNG-only clients cannot display them.

Credits: aaANDkk and Koolson/Qure. The upstream [third-party notices](https://github.com/aaANDkk/Qure_Style_SVG/blob/dec37a65d73ea1b558706a446c0798397c2b05c0/THIRD_PARTY_NOTICES.md) retain the original source licenses and learning/non-commercial usage requirements.

## Maintenance

```bash
npm run refresh:all
npm run check
```

`npm run refresh:all` rebuilds the published Sub-Store scripts, YAML/MRS rulesets, DRJ custom rule INI, and generated configs. `npm run check` runs tests, drift checks, rule linting, and rename dictionary validation.

Generated settings are intended as a starting point. Refresh client configuration after updates and retain a working copy for rollback.

Mihomo uses the minimal domestic DNS baseline: AliDNS/DNSPod DoH in `nameserver`, with AliDNS DoT only for bootstrap (`default-nameserver`). Fake-IP and domestic real-IP exclusions remain; there are no separate direct/node resolvers, DNS proxy group, or per-domain DNS policies. LAN overrides such as `drj028.com` belong to the router's local DNS service. Routing rules, including Google Play's proxy route, remain independent of this DNS baseline.

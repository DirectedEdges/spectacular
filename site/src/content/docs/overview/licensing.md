---
title: "Licensing"
---

<script>document.querySelector('#_top').insertAdjacentHTML('afterbegin','<span class="sl-badge pro-badge pro-badge-hero">Pro</span>')</script>

Spectacular works at two tiers: **Free** and **Pro**. Both read the same Figma files, honour the same configuration, and produce the same structure. The difference is how much of that structure is filled in — free output describes each component, Pro output connects it to your token system, its other components, and every state it can be in.

Everything is usable at the free tier. Nothing is time-limited, watermarked, or withheld until you pay; a free spec is a complete, valid spec, and a free React component renders.

A Pro subscription is **$10/month**.

- [Purchase Pro](https://buy.polar.sh/polar_cl_xnq7zeKLXunrhOIpfNwA56F4wIq2Y0lLNCKmb0hhYJH) via Polar — you'll receive your license keys by email at checkout
- [Manage your subscription](https://polar.sh/directed-edges-llc/portal) from your Polar customer portal
- Need help? Contact [nathan@specsplugin.com](mailto:nathan@specsplugin.com)

## What You Get

Spectacular makes three things. Each has a free tier and a Pro tier, and they are gated separately.

| What you get | Free | Pro adds |
|---|---|---|
| **Data** | Component structure, variant evaluation, and metadata | Token and style references, prop bindings, invalid combinations |
| **Figma canvas output** | Every spec section, multi-column layout, all settings | Custom styling, the Examples settings, the Bridge tab |
| **Code** | The component, its contract, its stylesheet, one story per variant axis | Composition, glyphs, background images, compound stories, sticker sheets |

Nothing else is licensed. `fetch`, `scan`, `init`, `render`, `version`, `analyze`, `bridge`, `cache`, `migrate`, `applyCustomTokens` and `skills` behave identically with or without a key.

The rest of this page is the detail behind those three rows, then how keys and billing work.

## Licenses, by surface

### Figma Plugin

Enter your license key in the plugin's **Account** pane.

This activates the Pro tiers above when you work in Figma. Each key is meant for an individual user and can be activated on up to two machines (e.g. a work laptop and a personal machine).

:::caution[Spectacular, formerly Specs 2]
This page covers licensing for [**Spectacular**](https://www.figma.com/community/plugin/1549454283615386215/anova) and the **Spectacular CLI**. Subscriptions are purchased through Polar and managed from your Polar customer portal.

Spectacular is the plugin published on the Figma Community in 2025 as "Anova" and renamed "Specs 2" shortly after. It became Spectacular in 2026, when Figma shipped a feature of its own called Specs. Nothing changed but the name — the same plugin, the same license, the same subscription.

[**Specs (Classic)**](https://www.figma.com/community/plugin/1205622541257680763/specs) is a different, older plugin, launched in 2023. Its subscriptions are managed entirely by the Figma payment platform and cannot be transferred, converted, or applied to Spectacular or the CLI. If you have an active Classic subscription and want to use Spectacular, you'll need a separate Pro subscription through Polar.
:::

### CLI

A license key activates the Pro features on the command line. Provide your license key in any of these ways (recommended first):

1. **`.env` file** in your project directory (loaded automatically):
   ```
   SPECS_LICENSE_KEY=your-license-key
   ```

2. **Environment variable**: `SPECS_LICENSE_KEY`
   ```bash
   export SPECS_LICENSE_KEY="your-license-key"
   specs generate
   ```

3. **CLI flag**: `-l` or `--license` (useful for one-off runs or CI)
   ```bash
   specs generate -l "your-license-key"
   ```

When multiple sources are present, CLI flag takes priority over env var, which takes priority over `.env` file.

**What the CLI prints**: When a license key is provided, the CLI displays the result after generation:

| Scenario | CLI output |
|----------|-----------|
| Valid key | `License: PRO (active)` |
| Invalid key | `License: FREE (invalid — key not recognized)` |
| Expired key | `License: FREE (expired — key expired)` |
| Network error | `License: FREE (network-error — could not reach license server)` |

When no license key is provided, the CLI runs silently in free mode — no license line is printed.

CLI usage is metered at **50 generations per month**, resetting each billing cycle. Each `generate` call that produces Pro-tier output counts as one generation. Other commands — `fetch`, `scan`, `init` — are not metered. If you hit your monthly limit, you can purchase top-off packs to add more generations without waiting for the next cycle.

To avoid spending generations unnecessarily, omit your license key during trial runs — while you're iterating on config, testing component selection, or troubleshooting setup, free-tier output gives you the same structure without counting against your quota. Save Pro runs for when your config and component selection are dialed in.


### Subscription and Billing

Pro subscriptions are purchased and managed through [Polar](https://polar.sh), the merchant of record for Spectacular. Polar is a platform built for developers selling digital products — they handle payment processing, subscription management, and invoicing so you can manage your plan from a single portal.

From your Polar dashboard you can:

- View your current billing cycle and generation usage
- Upgrade, downgrade, or cancel your subscription
- Purchase top-off generation packs
- Download invoices

## Team Licensing

Teams can purchase a single subscription that covers multiple seats, with volume discounts that apply automatically at checkout:

| Team size | Discount |
|-----------|----------|
| 1–4 seats | None (standard Pro price) |
| 5–9 seats | 10% off |
| 10+ seats | 20% off |

Each seat is functionally identical to an individual Pro subscription: when a team member claims their seat, they receive their own plugin and CLI key pair by email, activated and managed the same way as any other Pro subscriber.

### Purchasing and managing seats

A team subscription is purchased by an administrator, who becomes the owner of the subscription and the only person who can adjust it. Seats are managed by email address — the administrator enters each team member's email individually, and Polar sends that person an invitation to claim their seat.

Seats are managed **one at a time** rather than via bulk import or CSV upload. The administrator adds, removes, or reassigns seats individually through the Polar customer portal.

### Claiming a seat

When a team member is invited, they receive an email with a link to claim their seat. **Invitations must be claimed within 24 hours** — after that the invitation expires and the administrator needs to re-send it from the portal. Once claimed, the team member receives their own plugin and CLI keys and activates them like any individual Pro subscriber.

A seat that hasn't been claimed yet still counts toward the subscription's seat total and is billed normally. Administrators can revoke a pending invitation and reassign the seat to a different email at any time.

### Adjusting your subscription

Administrators manage everything from the Polar customer portal — the same portal used for any Pro subscription. From the portal, the administrator can:

- Add new seats or remove existing ones
- See which seats are claimed and by whom
- Revoke a seat from a team member who has left
- Re-send an expired invitation
- Update payment method, download invoices, and cancel the subscription

The total seat count can be adjusted up or down at any time. Changes are **prorated** on month-to-month invoices — adding a seat mid-cycle adds a partial charge for the remaining days, and removing a seat issues a partial credit applied to the next invoice. The volume discount tier is re-evaluated whenever the seat count crosses a threshold (for example, going from 4 to 5 seats activates the 10% discount on the next invoice).

## Troubleshooting

**I have a Pro key but my output looks like free tier**
1. Check that the CLI prints `License: PRO (active)` after generation. If it prints `FREE`, the key wasn't accepted.
2. Verify the key is being picked up: CLI flag (`-l`) takes priority over `SPECS_LICENSE_KEY` env var, which takes priority over `.env` file. Make sure `.env` is in the directory you're running from.
3. For token references specifically, confirm your source's `fetch` list includes `variables` — tokens require fetched variable data.

**I see "network-error" in the license output**
License validation requires a brief network call to the license server. If your network blocks outbound HTTPS or you're offline, validation fails and `generate` falls back to free tier. Generation still completes — it does not error out.

**`specs react` or `specs webcomponents` failed with a license error**
The transforms behave differently on purpose. When a key is provided and the check cannot be completed — offline, rate-limited, interrupted — they **fail the run** rather than falling back to free.

A silent fallback there is worse than an error: it writes a whole free-tier tree under a valid key, and the run reports success. You would find out from the output, days later. A definitive rejection is different — `invalid`, `removed`, `expired` and `wrong-runtime` are answers, and free tier is the right response to them.

Run without a key to emit free-tier output deliberately. That is not an unchecked key, so nothing fails.

**My `invalidPropCombinations` are missing**
This requires both `spec.invalidCombinations: true` (the default) and an active Pro license. If either condition is missing, the array is silently omitted.

## FAQ

**Can I use all config settings at the free tier?**
Yes. Every config setting is accepted at both tiers. Settings that affect pro-only features (like `spec.tokens` or `spec.invalidCombinations`) are stored in your `config/settings.yaml` and take effect when you add a license key.

**Will my specs break if my license expires?**
No. Previously generated specs are static files — they don't change. Future generations will produce free-tier output (raw values, default variant only) until the license is renewed.

**I just got a Pro license. Do I need to regenerate?**
Yes. Previously generated specs are static files and won't retroactively gain Pro features. Run your generation commands again with the license key to produce Pro-tier output.

**Are CLI and plugin license keys the same?**
No. The CLI and Figma plugin use separate license keys. Each is purchased and activated independently.

**Does license validation require internet access?**
Yes. The CLI makes a brief HTTPS call to validate your key. If the network is unavailable, `generate` continues with free-tier output and reports `network-error` in the license status; `react` and `webcomponents` fail the run instead, for the reason above. Previously validated sessions do not cache — each generation validates independently.

**Can I share my license key with my team?**
License terms depend on your plan, but generally, no. Each Pro license is intended for an individual user.

## See Also

- [Getting Started](/cli/getting-started/) — Installation and first spec
- [Configuration Reference](/settings/) — All config options
- [Settings Schema](/schema/settings/) — settings reference and defaults

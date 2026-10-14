# LifeOS Installation on Debian-Devil

This repository provides an automated installation process for integrating LifeOS with Hermes and Notion on a Debian-Devil system.

## Prerequisites

- Debian-Devil environment
- Hermes installed
- Bun installed
- Notion API integration configured

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/JsonLord/LifeOS.git
   cd LifeOS
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Setup the coach profile:
   ```bash
   bun run setup
   ```
   *This command installs dependencies, detects Hermes, and prepares an isolated coach profile.*

4. Configure your environment:
   Copy `config/storage.example.toml` to your configuration directory and set up `NOTION_API_KEY` and `NOTION_LIFEOS_ROOT_PAGE_ID` as environment variables.

5. Discover your Notion setup (Do not hardcode IDs):
   ```bash
   bun run discover
   ```
   *This dynamically discovers your existing Notion LifeOS mother page, child pages, and databases using restricted API access.*

6. Validate the mappings:
   ```bash
   bun run validate
   ```
   *This verifies the discovered mappings using read-only access.*

7. Mount the coach profile in Hermes:
   ```bash
   bun run coach:mount
   ```
   *This connects LifeOS to the existing Hermes installation.*

## Maintenance

- **Health check**: Run `bun run doctor` to check the environment, dependencies, Hermes, and Notion configuration.
- **Upgrade**: Run `bun run upgrade` to safely update from the main branch. A backup is automatically created.
- **Rollback**: Run `bun run rollback` to restore the previous working state if an upgrade fails.

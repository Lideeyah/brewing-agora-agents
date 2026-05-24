"""
Brewing Circle DCW Integration — Pillar D: Developer-Controlled Wallets
=======================================================================
Provisions and manages agent wallets via Circle's MPC infrastructure.
Keys never leave Circle's HSM — agents sign execution payloads autonomously
without exposing private key material.

Falls back to web3 ephemeral wallets when Circle credentials are not set,
so the demo runs regardless of Circle API access.
"""
from __future__ import annotations

import os
import uuid
import logging
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env", override=True)

log = logging.getLogger(__name__)

# ── Wallet descriptor ─────────────────────────────────────────────────────────

@dataclass
class AgentWallet:
    address:    str
    wallet_id:  str          # Circle wallet ID (or "ephemeral" for fallback)
    managed:    bool         # True = Circle MPC, False = local ephemeral
    provider:   str          # "circle-dcw" | "web3-ephemeral"


# ── Circle DCW provider ───────────────────────────────────────────────────────

class CircleWalletProvider:
    """
    Wraps Circle Developer-Controlled Wallets API.
    Creates one wallet per agent; Circle holds the MPC key shards.
    """

    def __init__(self):
        self.api_key       = os.getenv("CIRCLE_API_KEY", "")
        self.entity_secret = os.getenv("CIRCLE_ENTITY_SECRET", "")
        self.wallet_set_id = os.getenv("CIRCLE_WALLET_SET_ID", "")
        self._client       = None
        self.available     = False

        if self.api_key and self.entity_secret and self.wallet_set_id:
            try:
                from circle.web3 import developer_controlled_wallets as dcw
                cfg = dcw.Configuration(host="https://api.circle.com")
                cfg.api_key["bearerAuth"] = self.api_key
                self._client    = dcw.ApiClient(cfg)
                self._wallets   = dcw.WalletsApi(self._client)
                self.available  = True
                log.info("Circle DCW provider initialised ✓")
            except Exception as e:
                log.warning(f"Circle DCW init failed: {e} — falling back to ephemeral wallets")

    def create_wallet(self, agent_name: str) -> AgentWallet:
        if not self.available:
            return self._ephemeral_wallet()

        try:
            from circle.web3 import developer_controlled_wallets as dcw

            # Generate entity secret ciphertext for this request
            from circle.web3.utils import sign_entity_secret_ciphertext
            ciphertext = sign_entity_secret_ciphertext(self.entity_secret, self.api_key)

            body = dcw.CreateWalletRequest(
                idempotency_key   = str(uuid.uuid4()),
                entity_secret_ciphertext = ciphertext,
                wallet_set_id     = self.wallet_set_id,
                blockchain        = "EVM",          # Arc is EVM-compatible
                count             = 1,
                metadata          = [{"name": agent_name, "ref_id": agent_name}],
            )
            resp    = self._wallets.create_wallet(body)
            wallet  = resp.data.wallets[0]
            address = wallet.address

            log.info(f"Circle DCW wallet created for {agent_name}: {address}")
            return AgentWallet(
                address   = address,
                wallet_id = wallet.id,
                managed   = True,
                provider  = "circle-dcw",
            )
        except Exception as e:
            log.warning(f"Circle wallet creation failed ({e}), using ephemeral fallback")
            return self._ephemeral_wallet()

    @staticmethod
    def _ephemeral_wallet() -> AgentWallet:
        """Web3 throwaway wallet — used when Circle credentials not set."""
        from web3 import Web3
        acct = Web3().eth.account.create()
        return AgentWallet(
            address   = acct.address,
            wallet_id = "ephemeral",
            managed   = False,
            provider  = "web3-ephemeral",
        )


# ── Global singleton ──────────────────────────────────────────────────────────

circle = CircleWalletProvider()


def provision_agent_wallet(agent_name: str) -> AgentWallet:
    """
    Public entry point. Returns a Circle-managed MPC wallet when credentials
    are available, otherwise a local ephemeral wallet for testing.
    """
    wallet = circle.create_wallet(agent_name)
    log.info(
        f"Agent wallet provisioned [{wallet.provider}] "
        f"name={agent_name} addr={wallet.address}"
    )
    return wallet

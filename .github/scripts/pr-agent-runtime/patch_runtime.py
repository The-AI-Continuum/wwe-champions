#!/usr/bin/env python3
"""Patch a hash-locked PR-Agent 0.45.0 / LiteLLM 1.99.0 environment for reviewed price-first routing.

Policy (System/decisions.md, 2026-11-09): every model call of the mandatory
review sends OpenRouter `provider.sort=price` without dropping other provider options, goes to
exactly one approved model with no fallback or routing override, and is published only when the
provider reports a terminal `stop`. Upstream cannot express this: PR-Agent has no sort setting
(through 0.50.0), LiteLLM synthesizes `finish_reason=stop` when OpenRouter's stream ends with
`[DONE]` (or any content line quoting it) or simply ends, maps any other finish_reason it does
not know, including the provider's `error`, to `stop`, and normalizes a non-streamed null
finish_reason to `stop`. Three source files are therefore patched, each only from its exact
upstream bytes:

  pr_agent/algo/ai_handlers/litellm_ai_handler.py               request gate, price sort, always stream
  litellm/llms/openrouter/chat/transformation.py                 no `[DONE]` substring rule; raw finish_reason other than stop/length refused
  litellm/litellm_core_utils/streaming_handler.py                OpenRouter stream end no longer implies a stop

Every file is verified before and after patching against pinned SHA-256 digests; a mismatch
(another upstream version, an already patched file, a tampered file) fails closed and nothing is
written. The environment is expected to come from `install.sh`, which installs the hash-locked
upstream wheels first.

Usage: patch_runtime.py [SITE_PACKAGES]   (default: this interpreter's purelib)
"""
import hashlib
import os
from pathlib import Path
import sys
import sysconfig

# The only model the reviewed runtime may call. `EXTERNAL_PR_MODEL` in independent-review.yml,
# the CI review model and the binding verifier's `requestedModel` must equal this value;
# scripts/review-workflows/test/pr-agent-runtime.test.mjs enforces that.
APPROVED_MODEL = 'openrouter/z-ai/glm-5.3-flash'

# PyPI pr_agent-0.45.0-py3-none-any.whl sha256:
# dbce0ff308be6f47a2ead538d6980662e5e72c0155f49ee49b8ba9a4232976c5 (pinned in requirements.lock).
# The handler is byte-identical to upstream v0.45.0 commit f3b385ea2927247ddcff2fe252472380b9c8f5fc.
DISTRIBUTIONS = ('pr_agent-0.45.0.dist-info', 'litellm-1.99.0.dist-info')

HANDLER = 'pr_agent/algo/ai_handlers/litellm_ai_handler.py'
OPENROUTER_CHUNKS = 'litellm/llms/openrouter/chat/transformation.py'
STREAM_WRAPPER = 'litellm/litellm_core_utils/streaming_handler.py'

HANDLER_EDITS = (
    # Gate and price-first request. Runs before LiteLLM sees the request, so a rejected
    # request sends nothing.
    ('''        model = kwargs["model"]
        custom_llm_provider = str(kwargs.get("custom_llm_provider") or "").strip().lower()
''', f'''        model = kwargs["model"]
        if model != "{APPROVED_MODEL}":
            raise ValueError("Model is not approved for mandatory review")
        custom_llm_provider = str(kwargs.get("custom_llm_provider") or "").strip().lower()
        if custom_llm_provider not in ("", "openrouter") or kwargs.get("deployment_id"):
            raise ValueError("Model routing override is not allowed")
        if any(kwargs.get(key) for key in ("fallbacks", "context_window_fallbacks", "content_policy_fallbacks", "model_list")):
            raise ValueError("Model fallbacks are not allowed")
        extra_body = kwargs.get("extra_body") or {{}}
        if not isinstance(extra_body, dict) or any(key in extra_body for key in ("model", "models", "route", "fallbacks")):
            raise ValueError("Model routing override is not allowed in extra_body")
        extra_body = dict(extra_body)
        provider = extra_body.get("provider") or {{}}
        if not isinstance(provider, dict):
            raise ValueError("OpenRouter provider options must be an object")
        extra_body["provider"] = {{**provider, "sort": "price"}}
        kwargs["extra_body"] = extra_body
'''),
    # Always stream: only a stream carries a terminal finish_reason that LiteLLM does not
    # rewrite, so completeness is decidable on this path only.
    ('        if model in self.streaming_required_models or force_streaming:\n',
     '        if True:  # reviewed runtime: only a stream exposes the provider\'s terminal finish_reason\n'),
    ('            return await _handle_streaming_response(response, model=model)\n',
     '''            content, finish_reason, completed_response = await _handle_streaming_response(response, model=model)
            if finish_reason == "length":
                raise ValueError("Truncated model response cannot be published")
            if finish_reason != "stop":
                raise ValueError("Unterminated model response cannot be published")
            return content, finish_reason, completed_response
'''),
)

OPENROUTER_CHUNK_EDITS = (
    ('''class OpenRouterChatCompletionStreamingHandler(BaseModelResponseIterator):
    def chunk_parser(''', '''class OpenRouterChatCompletionStreamingHandler(BaseModelResponseIterator):
    def _handle_string_chunk(self, str_line):
        # Upstream ends the response with finish_reason="stop" on any line containing "[DONE]"
        # (the sentinel, but also a content chunk quoting it), and LiteLLM maps every finish_reason
        # it does not know, including the provider's "error" and "network_error", to "stop".
        # Only a real provider "stop" or "length" may end a response, so anything else is refused
        # here from the raw chunk, before LiteLLM normalizes it.
        chunk = BaseModelResponseIterator._string_to_dict_parser(str_line=str_line)
        if not isinstance(chunk, dict) or not chunk:
            return {"text": "", "is_finished": False, "finish_reason": "",
                    "usage": None, "index": 0, "tool_use": None}
        for choice in chunk.get("choices") or []:
            reason = choice.get("finish_reason") if isinstance(choice, dict) else None
            if reason not in (None, "", "stop", "length"):
                raise ValueError(f"Unsupported OpenRouter finish_reason: {reason!r}")
        return self.chunk_parser(chunk=chunk)

    def chunk_parser('''),
)

STREAM_WRAPPER_EDITS = (
    ('            model_response.choices[0].finish_reason = "stop"\n\n        ## if tool use\n',
     '            model_response.choices[0].finish_reason = None if self.custom_llm_provider == "openrouter" else "stop"\n\n        ## if tool use\n'),
)

# (relative path, sha256 of the exact upstream bytes, sha256 of the patched bytes, edits)
TARGETS = (
    (HANDLER, 'd652d4cbc81a0cefdd1b2b44ae1a2c1a4b9f2d14a000d27bd36f08fa692ed325',
     '9f11d4b3f47a98fe338295169427092ade951394933afef53ef59cbd6962584f', HANDLER_EDITS),
    (OPENROUTER_CHUNKS, 'f96f40d58758122dae8aa9c12d870d8417f24ec4d186a00122a1c71d48b6307d',
     'c12a7df806772fab906571c900f0e31d3d7791dab844b6a33d4ae17f5670b4be', OPENROUTER_CHUNK_EDITS),
    (STREAM_WRAPPER, '1979761ab31d5be824755c73ae4cdd842c4e1c6cad8c5cb2ad097a0f344cf5ef',
     'ec7117bd89d8f0882d10107e05a0dfb959cdd19d8e5a858bf4f792501ea305a2', STREAM_WRAPPER_EDITS),
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def patch_source(relative_path: str, source: bytes) -> bytes:
    """Return the reviewed patched bytes for one target; refuse anything but the exact upstream source."""
    for path, source_sha, patched_sha, edits in TARGETS:
        if path != relative_path:
            continue
        if sha256(source) != source_sha:
            raise ValueError(f'upstream source hash mismatch for {path}; refusing to patch')
        text = source.decode('utf-8')
        for old, new in edits:
            if text.count(old) != 1:
                raise ValueError(f'upstream patch context mismatch for {path}; refusing to patch')
            text = text.replace(old, new, 1)
        patched = text.encode('utf-8')
        if sha256(patched) != patched_sha:
            raise ValueError(f'patched source hash mismatch for {path}; refusing to patch')
        return patched
    raise ValueError(f'unknown patch target {relative_path}')


def apply(site_packages: Path) -> None:
    for distribution in DISTRIBUTIONS:
        if not (site_packages / distribution).is_dir():
            raise ValueError(f'{distribution} is not installed in {site_packages}; refusing to patch')
    patched = []
    for relative_path, *_ in TARGETS:
        target = site_packages / relative_path
        patched.append((target, patch_source(relative_path, target.read_bytes())))
    # Every file verified: only now write, each through an atomic replace.
    for target, data in patched:
        temporary = target.with_name(target.name + '.reviewed-runtime')
        temporary.write_bytes(data)
        os.replace(temporary, target)


def main():
    if len(sys.argv) > 2:
        raise SystemExit('usage: patch_runtime.py [SITE_PACKAGES]')
    site_packages = Path(sys.argv[1] if len(sys.argv) == 2 else sysconfig.get_paths()['purelib'])
    apply(site_packages)
    for relative_path, *_ in TARGETS:
        print(f'patched {relative_path}')


if __name__ == '__main__':
    main()

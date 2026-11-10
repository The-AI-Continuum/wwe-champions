#!/usr/bin/env bash
# Install the reviewed PR-Agent runtime into a new virtualenv: hash-locked upstream wheels, then
# the reviewed price-first / complete-stream patch (patch_runtime.py).
#
#   install.sh VENV_DIRECTORY [--dependencies-only]
#
# Needs Python 3.12 (the lock was compiled for CPython 3.12 on x86_64 manylinux_2_28; PYTHON
# overrides the interpreter, default python3). VENV_DIRECTORY must not exist. The directory this
# script lives in is verified against MANIFEST.sha256 first, so a consumer copy that drifted from
# Brain's canonical runtime fails closed. `--dependencies-only` leaves upstream code unpatched
# and exists only so tests can compare against the unmodified baseline.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
venv=${1:?usage: install.sh VENV_DIRECTORY [--dependencies-only]}
mode=${2:-patch}
case "$mode" in patch | --dependencies-only) ;; *) echo "::error::unknown option: $mode" >&2; exit 2 ;; esac
[[ ! -e "$venv" ]] || { echo "::error::$venv already exists; the patch applies to pristine upstream files only." >&2; exit 2; }

# Integrity of the runtime files themselves (the lock files and the patch).
(cd "$here" && if command -v sha256sum >/dev/null; then sha256sum --check --quiet MANIFEST.sha256; else shasum -a 256 --check --quiet MANIFEST.sha256; fi)

python=${PYTHON:-python3}
"$python" -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)' \
  || { echo "::error::The reviewed runtime requires Python 3.12 (set PYTHON)." >&2; exit 2; }

"$python" -m venv "$venv"
pip=("$venv/bin/python" -m pip install --quiet --no-input --disable-pip-version-check --require-hashes --no-deps)
# html2text and giteapy exist only as source distributions. Their setup.py builds run against
# hash-locked setuptools/wheel instead of an isolated, unpinned build environment.
"${pip[@]}" -r "$here/build-requirements.lock"
"${pip[@]}" --no-build-isolation -r "$here/requirements.lock"

if [[ "$mode" == patch ]]; then
  "$venv/bin/python" "$here/patch_runtime.py"
fi

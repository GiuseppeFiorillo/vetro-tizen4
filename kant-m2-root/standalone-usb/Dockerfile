FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS node
FROM python:3.13.14-slim-trixie@sha256:9662417aace5ae7b8e2609cce472b72a8958e134ba372808abe9cc1a0c0125e6
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update -qq && apt-get install -y --no-install-recommends git ca-certificates xz-utils >/dev/null && rm -rf /var/lib/apt/lists/*
COPY requirements-build.txt /tmp/requirements-build.txt
RUN python -m pip install --no-cache-dir -r /tmp/requirements-build.txt
# Old Node is a host fixture runner only. It is never a listener or production service.
RUN python -c "import urllib.request,hashlib; b=urllib.request.urlopen('https://nodejs.org/dist/v4.4.3/node-v4.4.3-linux-x64.tar.xz',timeout=60).read(); assert hashlib.sha256(b).hexdigest()=='7d8919fa7c6fa927c0fe295fcb16c7025c974b717350e97ddbd7a46d3b60fbef'; open('/tmp/node4.tar.xz','wb').write(b)" \
    && mkdir /opt/node4 && tar -xJf /tmp/node4.tar.xz -C /opt/node4 --strip-components=1 && rm /tmp/node4.tar.xz
ENV PYTHONDONTWRITEBYTECODE=1 PYTHON=python3 NODE4=/opt/node4/bin/node
WORKDIR /work

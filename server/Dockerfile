# Build from the forme/ repo root:
#   docker build -f server/Dockerfile -t formepdf/forme .

FROM rust:1.88-bookworm AS builder

WORKDIR /app

# Copy the engine (path dependency)
COPY engine/ engine/

# Copy server manifests for dependency layer caching
COPY server/Cargo.toml server/Cargo.lock server/

# Create dummy main.rs to pre-build dependencies
RUN mkdir -p server/src && echo "fn main() {}" > server/src/main.rs
WORKDIR /app/server
RUN cargo build --release 2>/dev/null || true

# Copy actual source
COPY server/src/ src/

# Touch main.rs so cargo rebuilds it (not just the cached dummy)
RUN touch src/main.rs
RUN cargo build --release

# --- Runtime stage ---
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/server/target/release/forme-server /usr/local/bin/forme-server

RUN useradd -r -s /bin/false forme
USER forme

ENV HTTP_PORT=3000
EXPOSE 3000

CMD ["forme-server"]

.PHONY: dev infra api web test test-api test-web lint typecheck build benchmark

infra:
	docker compose up -d postgres redis

dev: infra
	@echo "Run the API with: PYTHONPATH=apps/api uvicorn app.main:app --reload --app-dir apps/api"
	@echo "Run the web app with: npm run dev:web"

api:
	PYTHONPATH=apps/api uvicorn app.main:app --reload --app-dir apps/api

web:
	npm run dev:web

test-api:
	PYTHONPATH=apps/api pytest apps/api/tests simulator/tests

test-web:
	npm run test:web

test: test-api test-web

lint:
	npm run lint

typecheck:
	npm run typecheck

build:
	npm run build

benchmark:
	PYTHONPATH=apps/api:simulator python3 scripts/benchmark.py --help


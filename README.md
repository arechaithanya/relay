# CrisisSync AI

Real-time emergency response orchestration prototype for hospitality venues.

Pipeline:

```text
REST trigger -> Kafka emergency-events -> rules + Gemini triage -> alerts/assignments -> Socket.io dashboard
```

## Local Run

Start Docker Desktop, then run the backend stack:

```bash
cd /Users/chaithanyareddy/Downloads/alert
docker compose up --build
```

In another terminal, run the dashboard:

```bash
cd /Users/chaithanyareddy/Downloads/alert
npm install --workspaces
npm run dev:dashboard
```

Open:

```text
http://localhost:5173
```

Trigger a demo event:

```bash
curl -X POST http://localhost:4001/emergency/fire \
  -H "Content-Type: application/json" \
  -d '{"location":"Kitchen"}'
```

## Google AI / Gemini

The processing service uses Gemini as an optional intelligence layer for incident severity, summary, and recommended response actions.

Set a Gemini API key before running:

```bash
cp .env.example .env
```

Edit `.env`:

```text
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-1.5-flash
```

Without `GEMINI_API_KEY`, the system falls back to the deterministic rule engine so local demos still work.

## Services

| Service | Purpose |
| --- | --- |
| `producer-service` | REST event triggers and incident/staff reads |
| `processing-service` | Kafka consumer, rule classification, Gemini enrichment, escalation |
| `assignment-service` | Nearest staff allocation |
| `notification-service` | Kafka consumer and Socket.io real-time fanout |
| `frontend/dashboard` | React live operations dashboard |

## APIs

```bash
POST /emergency/fire
POST /emergency/medical
POST /emergency/security
GET /incidents
GET /staff
```

## Google Cloud Deployment

This repo includes a GKE deployment path:

- `cloudbuild.yaml` builds backend service images and deploys manifests.
- `deploy/gke/*.yaml` defines Kafka, Zookeeper, MongoDB, and the four backend services.
- Gemini runs in `processing-service` through `GEMINI_API_KEY`.

Create cloud resources:

```bash
gcloud services enable cloudbuild.googleapis.com container.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create crisissync --repository-format=docker --location=us-central1
gcloud container clusters create-auto crisissync-cluster --region us-central1
```

Create/update the Gemini secret before deployment:

```bash
kubectl create namespace crisissync --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic crisissync-secrets \
  --namespace crisissync \
  --from-literal=GEMINI_API_KEY="your_key_here" \
  --dry-run=client -o yaml | kubectl apply -f -
```

Deploy with Cloud Build:

```bash
gcloud builds submit \
  --substitutions=_REGION=us-central1,_CLUSTER=crisissync-cluster,_NAMESPACE=crisissync,_REPOSITORY=crisissync
```

Get public service IPs:

```bash
kubectl get svc -n crisissync
```

For a production version, replace the in-cluster Kafka and MongoDB manifests with managed services such as Confluent Cloud / Google Managed Service for Apache Kafka and MongoDB Atlas, then update `KAFKA_BROKERS` and `MONGO_URI` in `deploy/gke/00-config.yaml`.

## Stop Local Stack

```bash
docker compose down
```

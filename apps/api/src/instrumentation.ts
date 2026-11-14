import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// Import before HTTP/PG libraries. Never put request bodies, query values or auth headers in spans.
export function startTelemetry() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return undefined;
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'king-david-api' }),
    traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { headersToSpanAttributes: { client: { requestHeaders: [], responseHeaders: [] }, server: { requestHeaders: [], responseHeaders: [] } } },
      '@opentelemetry/instrumentation-pg': { enhancedDatabaseReporting: false, requireParentSpan: true },
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  });
  sdk.start(); return sdk;
}

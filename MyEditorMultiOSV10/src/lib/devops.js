// Dockerfile and Kubernetes manifest support for the editor: completion
// sources added to the Dockerfile and YAML grammars (src/App.jsx
// applyLanguage). The checks (syntax, required fields …) run in the backend
// (core/lint.js: the YAML tools `yaml` / `kube`, plus kubeconform / kubectl).

// ── Dockerfile ──
const DOCKER_INSTRUCTIONS = [
  ['FROM', 'FROM image[:tag] [AS name]'], ['RUN', 'RUN command'], ['CMD', 'CMD ["executable", "arg"]'], ['LABEL', 'LABEL key="value"'],
  ['EXPOSE', 'EXPOSE port'], ['ENV', 'ENV KEY=value'], ['ADD', 'ADD src dest'], ['COPY', 'COPY [--from=stage] src dest'], ['ENTRYPOINT', 'ENTRYPOINT ["executable"]'],
  ['VOLUME', 'VOLUME ["/data"]'], ['USER', 'USER name'], ['WORKDIR', 'WORKDIR /path'], ['ARG', 'ARG NAME[=default]'], ['ONBUILD', 'ONBUILD instruction'],
  ['STOPSIGNAL', 'STOPSIGNAL signal'], ['HEALTHCHECK', 'HEALTHCHECK [options] CMD command'], ['SHELL', 'SHELL ["executable", "-c"]'], ['MAINTAINER', 'MAINTAINER name (deprecated: use LABEL)'],
];
const DOCKER_IMAGES = ['node:20-alpine', 'node:22', 'python:3.12-slim', 'python:3.12', 'nginx:alpine', 'nginx:latest', 'alpine:3.20', 'ubuntu:24.04', 'debian:bookworm-slim', 'golang:1.22-alpine', 'openjdk:21-slim', 'eclipse-temurin:21-jre', 'postgres:16', 'redis:7-alpine', 'mysql:8', 'busybox', 'scratch', 'mcr.microsoft.com/dotnet/sdk:8.0', 'mcr.microsoft.com/dotnet/aspnet:8.0', 'rust:1-slim', 'ruby:3.3-slim', 'php:8.3-apache'];
const DOCKER_FLAGS = { COPY: ['--from=', '--chown=', '--chmod=', '--link'], ADD: ['--chown=', '--chmod=', '--checksum='], RUN: ['--mount=type=cache,target=', '--mount=type=bind,source=', '--network=none'], HEALTHCHECK: ['--interval=30s', '--timeout=30s', '--start-period=', '--retries=3', 'CMD', 'NONE'] };

export function dockerfileCompletion(ctx) {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const word = ctx.matchBefore(/[\w.:/@=-]*/);
  // The instruction: at the start of a line (continuation lines of RUN … are shell)
  if (/^\s*[A-Za-z]*$/.test(before)) {
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    return { from: word ? word.from : ctx.pos, options: DOCKER_INSTRUCTIONS.map(([k, d]) => ({ label: k, type: 'keyword', detail: d, apply: `${k} ` })), validFor: /^[A-Za-z]*$/ };
  }
  const m = /^\s*([A-Za-z]+)\s+(.*)$/.exec(before);
  if (!m) return null;
  const ins = m[1].toUpperCase();
  if (ins === 'FROM' && !/\s/.test(m[2].trim()) ) return { from: word ? word.from : ctx.pos, options: DOCKER_IMAGES.map((i) => ({ label: i, type: 'constant' })).concat([{ label: 'AS', type: 'keyword', apply: 'AS ' }]), validFor: /^[\w.:/@-]*$/ };
  if (DOCKER_FLAGS[ins] && /(^|\s)-?-?[\w=-]*$/.test(m[2])) return { from: word ? word.from : ctx.pos, options: DOCKER_FLAGS[ins].map((f) => ({ label: f, type: 'property' })), validFor: /^[\w=-]*$/ };
  return null;
}

// ── Kubernetes manifests (YAML with apiVersion / kind) ──
const K8S_KINDS = ['Pod', 'Deployment', 'Service', 'ConfigMap', 'Secret', 'Namespace', 'Ingress', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'ReplicaSet', 'PersistentVolume', 'PersistentVolumeClaim', 'ServiceAccount', 'Role', 'RoleBinding', 'ClusterRole', 'ClusterRoleBinding', 'HorizontalPodAutoscaler', 'NetworkPolicy', 'StorageClass', 'LimitRange', 'ResourceQuota', 'Endpoints', 'Event', 'PodDisruptionBudget', 'CustomResourceDefinition'];
const K8S_API = ['v1', 'apps/v1', 'batch/v1', 'networking.k8s.io/v1', 'rbac.authorization.k8s.io/v1', 'autoscaling/v2', 'storage.k8s.io/v1', 'policy/v1', 'apiextensions.k8s.io/v1'];
// keys by the parent key they appear under ('' = top level); the most used first
const K8S_KEYS = {
  '': ['apiVersion', 'kind', 'metadata', 'spec', 'data', 'stringData', 'type', 'status', 'rules', 'subjects', 'roleRef', 'items'],
  metadata: ['name', 'namespace', 'labels', 'annotations', 'generateName', 'finalizers', 'ownerReferences'],
  spec: ['containers', 'initContainers', 'volumes', 'replicas', 'selector', 'template', 'strategy', 'serviceName', 'restartPolicy', 'nodeSelector', 'affinity', 'tolerations', 'serviceAccountName', 'securityContext', 'imagePullSecrets', 'hostNetwork', 'dnsPolicy', 'terminationGracePeriodSeconds', 'ports', 'clusterIP', 'externalName', 'sessionAffinity', 'rules', 'tls', 'ingressClassName', 'schedule', 'jobTemplate', 'backoffLimit', 'completions', 'parallelism', 'accessModes', 'resources', 'storageClassName', 'capacity', 'hostPath', 'minReplicas', 'maxReplicas', 'scaleTargetRef', 'metrics', 'podSelector', 'policyTypes', 'ingress', 'egress', 'minAvailable', 'maxUnavailable'],
  template: ['metadata', 'spec'],
  containers: ['name', 'image', 'imagePullPolicy', 'command', 'args', 'ports', 'env', 'envFrom', 'resources', 'volumeMounts', 'livenessProbe', 'readinessProbe', 'startupProbe', 'securityContext', 'workingDir', 'lifecycle', 'stdin', 'tty'],
  initContainers: ['name', 'image', 'command', 'args', 'env', 'volumeMounts', 'resources'],
  ports: ['containerPort', 'name', 'protocol', 'hostPort', 'port', 'targetPort', 'nodePort'],
  env: ['name', 'value', 'valueFrom'],
  valueFrom: ['configMapKeyRef', 'secretKeyRef', 'fieldRef', 'resourceFieldRef'],
  configMapKeyRef: ['name', 'key', 'optional'], secretKeyRef: ['name', 'key', 'optional'], fieldRef: ['fieldPath'],
  envFrom: ['configMapRef', 'secretRef', 'prefix'], configMapRef: ['name', 'optional'], secretRef: ['name', 'optional'],
  resources: ['requests', 'limits'], requests: ['cpu', 'memory', 'ephemeral-storage', 'storage'], limits: ['cpu', 'memory', 'ephemeral-storage', 'nvidia.com/gpu'],
  volumeMounts: ['name', 'mountPath', 'subPath', 'readOnly'],
  volumes: ['name', 'configMap', 'secret', 'emptyDir', 'persistentVolumeClaim', 'hostPath', 'projected', 'downwardAPI'],
  configMap: ['name', 'items', 'defaultMode', 'optional'], secret: ['secretName', 'items', 'defaultMode', 'optional'], persistentVolumeClaim: ['claimName', 'readOnly'], emptyDir: ['medium', 'sizeLimit'], hostPath: ['path', 'type'],
  livenessProbe: ['httpGet', 'exec', 'tcpSocket', 'grpc', 'initialDelaySeconds', 'periodSeconds', 'timeoutSeconds', 'failureThreshold', 'successThreshold'],
  readinessProbe: ['httpGet', 'exec', 'tcpSocket', 'grpc', 'initialDelaySeconds', 'periodSeconds', 'timeoutSeconds', 'failureThreshold', 'successThreshold'],
  startupProbe: ['httpGet', 'exec', 'tcpSocket', 'initialDelaySeconds', 'periodSeconds', 'failureThreshold'],
  httpGet: ['path', 'port', 'scheme', 'httpHeaders'], tcpSocket: ['port'], exec: ['command'],
  selector: ['matchLabels', 'matchExpressions', 'app'], matchExpressions: ['key', 'operator', 'values'],
  strategy: ['type', 'rollingUpdate'], rollingUpdate: ['maxSurge', 'maxUnavailable'],
  securityContext: ['runAsUser', 'runAsGroup', 'runAsNonRoot', 'fsGroup', 'privileged', 'readOnlyRootFilesystem', 'allowPrivilegeEscalation', 'capabilities'], capabilities: ['add', 'drop'],
  affinity: ['nodeAffinity', 'podAffinity', 'podAntiAffinity'], tolerations: ['key', 'operator', 'value', 'effect', 'tolerationSeconds'],
  rules: ['host', 'http', 'apiGroups', 'resources', 'verbs'], http: ['paths'], paths: ['path', 'pathType', 'backend'], backend: ['service', 'resource'], service: ['name', 'port'], tls: ['hosts', 'secretName'],
  jobTemplate: ['spec'], scaleTargetRef: ['apiVersion', 'kind', 'name'], metrics: ['type', 'resource'],
  subjects: ['kind', 'name', 'namespace', 'apiGroup'], roleRef: ['apiGroup', 'kind', 'name'],
  lifecycle: ['postStart', 'preStop'], labels: ['app', 'app.kubernetes.io/name', 'app.kubernetes.io/instance', 'app.kubernetes.io/component', 'tier', 'environment'],
};
const K8S_VALUES = {
  kind: K8S_KINDS, apiVersion: K8S_API, imagePullPolicy: ['IfNotPresent', 'Always', 'Never'], restartPolicy: ['Always', 'OnFailure', 'Never'], protocol: ['TCP', 'UDP', 'SCTP'],
  type: ['ClusterIP', 'NodePort', 'LoadBalancer', 'ExternalName', 'Opaque', 'kubernetes.io/tls', 'kubernetes.io/dockerconfigjson', 'RollingUpdate', 'Recreate', 'Resource', 'Ingress', 'Egress'],
  pathType: ['Prefix', 'Exact', 'ImplementationSpecific'], accessModes: ['ReadWriteOnce', 'ReadOnlyMany', 'ReadWriteMany', 'ReadWriteOncePod'], dnsPolicy: ['ClusterFirst', 'Default', 'None', 'ClusterFirstWithHostNet'],
  scheme: ['HTTP', 'HTTPS'], operator: ['In', 'NotIn', 'Exists', 'DoesNotExist', 'Equal'], effect: ['NoSchedule', 'PreferNoSchedule', 'NoExecute'], medium: ['Memory', ''], concurrencyPolicy: ['Allow', 'Forbid', 'Replace'],
};

export const looksLikeKubernetes = (text) => /^\s*apiVersion\s*:/m.test(text) && /^\s*kind\s*:/m.test(text);

// The key the cursor's line is nested under: the nearest line above with less indentation ("- name:" list items count as their key).
function parentKey(doc, lineNo, indent) {
  for (let n = lineNo - 1; n >= 1; n--) {
    const t = doc.line(n).text;
    if (!t.trim() || /^\s*#/.test(t)) continue;
    const ind = /^\s*/.exec(t)[0].length;
    const m = /^\s*(?:-\s+)?([\w./-]+)\s*:/.exec(t);
    if (ind < indent && m) return m[1];
    if (ind < indent && /^\s*-\s*$/.test(t)) continue;
  }
  return '';
}

export function kubernetesCompletion(ctx) {
  const text = ctx.state.doc.toString();
  if (!looksLikeKubernetes(text)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  // a value after "key: "
  const kv = /^(\s*)(?:-\s+)?([\w./-]+)\s*:\s*([\w./-]*)$/.exec(before);
  if (kv && K8S_VALUES[kv[2]]) {
    const w = ctx.matchBefore(/[\w./-]*/);
    return { from: w ? w.from : ctx.pos, options: K8S_VALUES[kv[2]].map((v) => ({ label: v, type: 'constant' })), validFor: /^[\w./-]*$/ };
  }
  // a key
  const km = /^(\s*)(?:-\s+)?([\w./-]*)$/.exec(before);
  if (!km) return null;
  if (!km[2] && !ctx.explicit) return null;
  const indent = km[1].length + (/^\s*-\s+/.test(before) ? 2 : 0);
  let parent = parentKey(ctx.state.doc, line.number, indent);
  // a list item under "containers:" etc. is nested under that key; the parent's own list marker does not matter
  const keys = K8S_KEYS[parent] || K8S_KEYS[''];
  const w = ctx.matchBefore(/[\w./-]*/);
  return { from: w ? w.from : ctx.pos, options: keys.map((k) => ({ label: k, type: 'property', apply: `${k}: ` })), validFor: /^[\w./-]*$/ };
}

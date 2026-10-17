// Cloud architecture catalogues (AWS, Azure, Google Cloud): the services the
// toolbox offers, their category (which sets the tile colour) and the group
// kinds (cloud, region, VPC, subnet …) with their frame colours. The tiles are
// drawn by render/shapes.js; no vendor artwork is used.

export const PROVIDERS = {
  aws: { name: 'AWS', color: '#232f3e' },
  azure: { name: 'Azure', color: '#0078d4' },
  gcp: { name: 'Google Cloud', color: '#4285f4' },
};

/** Category → tile colour per provider. */
export const CATEGORY_COLORS = {
  aws: { compute: '#ed7100', storage: '#7aa116', database: '#c925d1', network: '#8c4fff', security: '#dd344c', analytics: '#8c4fff', integration: '#e7157b', ml: '#01a88d', management: '#e7157b', devtools: '#c925d1', user: '#232f3e' },
  azure: { compute: '#0078d4', storage: '#0072c6', database: '#3999c6', network: '#5ea0ef', security: '#e8513a', analytics: '#773adc', integration: '#7fba00', ml: '#008272', management: '#50e6ff', devtools: '#0078d4', user: '#5c2d91' },
  gcp: { compute: '#4285f4', storage: '#34a853', database: '#5c6bc0', network: '#ea4335', security: '#fbbc04', analytics: '#669df6', integration: '#a142f4', ml: '#1a73e8', management: '#5f6368', devtools: '#4285f4', user: '#5f6368' },
};

/** [service, short label, category] */
export const SERVICES = {
  aws: [
    ['EC2', 'EC2', 'compute'], ['Lambda', 'λ', 'compute'], ['ECS', 'ECS', 'compute'], ['EKS', 'EKS', 'compute'], ['Fargate', 'FG', 'compute'], ['Elastic Beanstalk', 'EB', 'compute'], ['Auto Scaling', 'AS', 'compute'],
    ['S3', 'S3', 'storage'], ['EBS', 'EBS', 'storage'], ['EFS', 'EFS', 'storage'], ['Glacier', 'GL', 'storage'], ['Backup', 'BK', 'storage'],
    ['RDS', 'RDS', 'database'], ['Aurora', 'AU', 'database'], ['DynamoDB', 'DDB', 'database'], ['ElastiCache', 'EC', 'database'], ['Redshift', 'RS', 'database'], ['DocumentDB', 'DOC', 'database'],
    ['VPC', 'VPC', 'network'], ['CloudFront', 'CF', 'network'], ['Route 53', 'R53', 'network'], ['API Gateway', 'API', 'network'], ['Elastic Load Balancing', 'ELB', 'network'], ['Direct Connect', 'DX', 'network'], ['NAT Gateway', 'NAT', 'network'], ['Internet Gateway', 'IGW', 'network'],
    ['IAM', 'IAM', 'security'], ['Cognito', 'COG', 'security'], ['KMS', 'KMS', 'security'], ['WAF', 'WAF', 'security'], ['Shield', 'SH', 'security'], ['Secrets Manager', 'SM', 'security'],
    ['Kinesis', 'KIN', 'analytics'], ['Athena', 'ATH', 'analytics'], ['Glue', 'GLU', 'analytics'], ['EMR', 'EMR', 'analytics'], ['OpenSearch', 'OS', 'analytics'],
    ['SQS', 'SQS', 'integration'], ['SNS', 'SNS', 'integration'], ['EventBridge', 'EVB', 'integration'], ['Step Functions', 'SF', 'integration'],
    ['SageMaker', 'SGM', 'ml'], ['Bedrock', 'BR', 'ml'], ['Rekognition', 'REK', 'ml'],
    ['CloudWatch', 'CW', 'management'], ['CloudFormation', 'CFN', 'management'], ['CloudTrail', 'CT', 'management'], ['Systems Manager', 'SSM', 'management'],
    ['CodePipeline', 'CP', 'devtools'], ['CodeBuild', 'CB', 'devtools'], ['User', '👤', 'user'], ['Client', 'PC', 'user'], ['Mobile Client', 'MOB', 'user'],
  ],
  azure: [
    ['Virtual Machines', 'VM', 'compute'], ['App Service', 'APP', 'compute'], ['Functions', 'FN', 'compute'], ['AKS', 'AKS', 'compute'], ['Container Instances', 'ACI', 'compute'], ['VM Scale Sets', 'VMSS', 'compute'],
    ['Blob Storage', 'BLOB', 'storage'], ['Storage Account', 'SA', 'storage'], ['Files', 'FILE', 'storage'], ['Disk', 'DISK', 'storage'],
    ['SQL Database', 'SQL', 'database'], ['Cosmos DB', 'CDB', 'database'], ['Cache for Redis', 'RED', 'database'], ['PostgreSQL', 'PG', 'database'], ['MySQL', 'MY', 'database'],
    ['Virtual Network', 'VNET', 'network'], ['Load Balancer', 'LB', 'network'], ['Application Gateway', 'AGW', 'network'], ['Front Door', 'FD', 'network'], ['DNS', 'DNS', 'network'], ['VPN Gateway', 'VPN', 'network'], ['API Management', 'APIM', 'network'],
    ['Entra ID', 'ID', 'security'], ['Key Vault', 'KV', 'security'], ['Firewall', 'FW', 'security'], ['Defender', 'DEF', 'security'],
    ['Synapse', 'SYN', 'analytics'], ['Data Factory', 'ADF', 'analytics'], ['Event Hubs', 'EH', 'analytics'], ['Databricks', 'DBX', 'analytics'],
    ['Service Bus', 'SB', 'integration'], ['Event Grid', 'EG', 'integration'], ['Logic Apps', 'LA', 'integration'],
    ['Machine Learning', 'ML', 'ml'], ['OpenAI', 'AI', 'ml'], ['Cognitive Services', 'COG', 'ml'],
    ['Monitor', 'MON', 'management'], ['Log Analytics', 'LOG', 'management'], ['Resource Manager', 'ARM', 'management'], ['DevOps', 'DEV', 'devtools'], ['User', '👤', 'user'],
  ],
  gcp: [
    ['Compute Engine', 'GCE', 'compute'], ['Cloud Run', 'RUN', 'compute'], ['Cloud Functions', 'FN', 'compute'], ['GKE', 'GKE', 'compute'], ['App Engine', 'GAE', 'compute'],
    ['Cloud Storage', 'GCS', 'storage'], ['Filestore', 'FS', 'storage'], ['Persistent Disk', 'PD', 'storage'],
    ['Cloud SQL', 'SQL', 'database'], ['Spanner', 'SPN', 'database'], ['Firestore', 'FST', 'database'], ['Bigtable', 'BT', 'database'], ['Memorystore', 'MEM', 'database'],
    ['VPC', 'VPC', 'network'], ['Cloud Load Balancing', 'LB', 'network'], ['Cloud CDN', 'CDN', 'network'], ['Cloud DNS', 'DNS', 'network'], ['Cloud NAT', 'NAT', 'network'], ['API Gateway', 'API', 'network'],
    ['IAM', 'IAM', 'security'], ['Secret Manager', 'SEC', 'security'], ['Cloud Armor', 'ARM', 'security'], ['KMS', 'KMS', 'security'],
    ['BigQuery', 'BQ', 'analytics'], ['Dataflow', 'DF', 'analytics'], ['Dataproc', 'DP', 'analytics'], ['Looker', 'LK', 'analytics'],
    ['Pub/Sub', 'PS', 'integration'], ['Workflows', 'WF', 'integration'], ['Eventarc', 'EA', 'integration'],
    ['Vertex AI', 'VAI', 'ml'], ['Gemini', 'GEM', 'ml'], ['Vision AI', 'VIS', 'ml'],
    ['Cloud Monitoring', 'MON', 'management'], ['Cloud Logging', 'LOG', 'management'], ['Cloud Build', 'CB', 'devtools'], ['User', '👤', 'user'],
  ],
};

/** [kind, label, colour, dashed] */
export const GROUP_KINDS = {
  aws: [['cloud', 'AWS Cloud', '#232f3e', false], ['region', 'Region', '#147eba', true], ['az', 'Availability Zone', '#147eba', true], ['vpc', 'VPC', '#8c4fff', false], ['publicSubnet', 'Public subnet', '#7aa116', false], ['privateSubnet', 'Private subnet', '#147eba', false], ['securityGroup', 'Security group', '#dd344c', false], ['autoScaling', 'Auto Scaling group', '#ed7100', true], ['account', 'AWS account', '#e7157b', false], ['corporate', 'Corporate data center', '#7d8998', false], ['generic', 'Group', '#7d8998', true]],
  azure: [['subscription', 'Subscription', '#0078d4', false], ['resourceGroup', 'Resource group', '#7a7a7a', true], ['region', 'Region', '#0078d4', true], ['vnet', 'Virtual network', '#5ea0ef', false], ['subnet', 'Subnet', '#50e6ff', false], ['generic', 'Group', '#7a7a7a', true]],
  gcp: [['project', 'Project', '#4285f4', false], ['region', 'Region', '#5f6368', true], ['zone', 'Zone', '#5f6368', true], ['vpc', 'VPC network', '#ea4335', false], ['subnet', 'Subnet', '#34a853', false], ['generic', 'Group', '#5f6368', true]],
};

export function serviceInfo(provider, service) {
  const list = SERVICES[provider] ?? SERVICES.aws;
  const found = list.find(([name]) => name === service);
  const [name, short, category] = found ?? [service, String(service ?? '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?', 'compute'];
  return { name, short, category, color: (CATEGORY_COLORS[provider] ?? CATEGORY_COLORS.aws)[category] ?? '#7d8998' };
}

export function groupInfo(provider, kind) {
  const list = GROUP_KINDS[provider] ?? GROUP_KINDS.aws;
  const found = list.find(([k]) => k === kind) ?? list.at(-1);
  return { kind: found[0], label: found[1], color: found[2], dashed: found[3] };
}

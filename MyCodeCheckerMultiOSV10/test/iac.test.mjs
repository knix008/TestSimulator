import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const iac = require('../core/iac/index.js');
const { LANGS } = require('../core/languages.js');

const TYPES = new Set(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT']);
const SEVERITIES = new Set(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']);

const lines = (...l) => l.join('\n');
const cfn = (...body) => lines("AWSTemplateFormatVersion: '2010-09-09'", 'Resources:', ...body);
const bucket = (...props) => cfn('  Logs:', '    Type: AWS::S3::Bucket', '    Properties:', ...props);
const sg = (...ingress) => cfn('  WebSg:', '    Type: AWS::EC2::SecurityGroup', '    Properties:', '      GroupDescription: web', '      SecurityGroupIngress:', ...ingress);
const k8s = (container, pod = [], top = []) => lines(
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: web', ...top, 'spec:', '  template:', '    spec:', ...pod,
  '      containers:', '        - name: web', '          image: nginx:1.27', ...container);
const SAFE_CONTAINER = [
  '          securityContext:', '            allowPrivilegeEscalation: false', '            runAsNonRoot: true',
  '          resources:', '            limits:', '              cpu: 500m', '              memory: 256Mi'];
const SAFE_POD = ['      automountServiceAccountToken: false'];
const play = (...tasks) => lines('- hosts: web', '  tasks:', ...tasks);
const ARM_HEAD = ['{', '  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",', '  "contentVersion": "1.0.0.0",'];
const arm = (...body) => lines(...ARM_HEAD, ...body, '}');
const armRes = (...props) => arm('  "resources": [', '    {', '      "type": "Microsoft.Storage/storageAccounts",', '      "name": "stg",', '      "properties": {', ...props, '      }', '    }', '  ]');

// One non-compliant and one compliant file per rule.
const FIXTURES = {
  'iac:cfn-s3-public-acl': { lang: 'yaml', bad: bucket('      AccessControl: PublicRead'), good: bucket('      AccessControl: Private') },
  'iac:cfn-s3-public-access-block-off': {
    lang: 'yaml',
    bad: bucket('      PublicAccessBlockConfiguration:', '        BlockPublicAcls: false'),
    good: bucket('      PublicAccessBlockConfiguration:', '        BlockPublicAcls: true'),
  },
  'iac:cfn-s3-no-encryption': {
    lang: 'yaml',
    bad: bucket('      VersioningConfiguration:', '        Status: Enabled'),
    good: bucket('      BucketEncryption:', '        ServerSideEncryptionConfiguration:', '          - ServerSideEncryptionByDefault:', '              SSEAlgorithm: aws:kms'),
  },
  'iac:cfn-s3-no-public-access-block': {
    lang: 'yaml',
    bad: bucket('      VersioningConfiguration:', '        Status: Enabled'),
    good: bucket('      PublicAccessBlockConfiguration:', '        BlockPublicAcls: true', '        BlockPublicPolicy: true'),
  },
  'iac:cfn-sg-open-admin-port': {
    lang: 'yaml',
    bad: sg('        - IpProtocol: tcp', '          FromPort: 22', '          ToPort: 22', '          CidrIp: 0.0.0.0/0'),
    good: sg('        - IpProtocol: tcp', '          FromPort: 443', '          ToPort: 443', '          CidrIp: 0.0.0.0/0', '        - IpProtocol: tcp', '          FromPort: 22', '          ToPort: 22', '          CidrIp: 10.0.0.0/8'),
  },
  'iac:cfn-rds-public': {
    lang: 'yaml',
    bad: cfn('  Db:', '    Type: AWS::RDS::DBInstance', '    Properties:', '      PubliclyAccessible: true', '      StorageEncrypted: true'),
    good: cfn('  Db:', '    Type: AWS::RDS::DBInstance', '    Properties:', '      PubliclyAccessible: false', '      StorageEncrypted: true'),
  },
  'iac:cfn-rds-unencrypted': {
    lang: 'yaml',
    bad: cfn('  Db:', '    Type: AWS::RDS::DBInstance', '    Properties:', '      Engine: postgres'),
    good: cfn('  Db:', '    Type: AWS::RDS::DBInstance', '    Properties:', '      Engine: postgres', '      StorageEncrypted: true'),
  },
  'iac:cfn-ebs-unencrypted': {
    lang: 'yaml',
    bad: cfn('  Vol:', '    Type: AWS::EC2::Volume', '    Properties:', '      Size: 10', '      Encrypted: false'),
    good: cfn('  Vol:', '    Type: AWS::EC2::Volume', '    Properties:', '      Size: 10', '      Encrypted: true'),
  },
  'iac:cfn-iam-wildcard-action': {
    lang: 'yaml',
    bad: cfn('  Role:', '    Type: AWS::IAM::Policy', '    Properties:', '      PolicyDocument:', '        Statement:', "          - Effect: Allow", "            Action: '*'", "            Resource: '*'"),
    good: cfn('  Role:', '    Type: AWS::IAM::Policy', '    Properties:', '      PolicyDocument:', '        Statement:', "          - Effect: Allow", "            Action: 's3:GetObject'", "            Resource: 'arn:aws:s3:::logs/*'"),
  },
  'iac:cfn-hardcoded-secret': {
    lang: 'yaml',
    bad: cfn('  Db:', '    Type: AWS::RDS::DBInstance', '    Properties:', '      StorageEncrypted: true', '      MasterUserPassword: Sup3rSecret'),
    good: cfn('  Db:', '    Type: AWS::RDS::DBInstance', '    Properties:', '      StorageEncrypted: true', "      MasterUserPassword: '{{resolve:secretsmanager:db:SecretString:password}}'"),
  },
  'iac:cfn-cloudtrail-log-validation-off': {
    lang: 'yaml',
    bad: cfn('  Trail:', '    Type: AWS::CloudTrail::Trail', '    Properties:', '      EnableLogFileValidation: false'),
    good: cfn('  Trail:', '    Type: AWS::CloudTrail::Trail', '    Properties:', '      EnableLogFileValidation: true'),
  },
  'iac:cfn-http-listener': {
    lang: 'yaml',
    bad: cfn('  Listener:', '    Type: AWS::ElasticLoadBalancingV2::Listener', '    Properties:', '      Port: 80', '      Protocol: HTTP', '      DefaultActions:', '        - Type: forward'),
    good: cfn('  Listener:', '    Type: AWS::ElasticLoadBalancingV2::Listener', '    Properties:', '      Port: 443', '      Protocol: HTTPS', '      DefaultActions:', '        - Type: forward'),
  },
  'iac:k8s-no-resource-limits': { lang: 'yaml', bad: k8s(['          securityContext:', '            allowPrivilegeEscalation: false'], SAFE_POD), good: k8s(SAFE_CONTAINER, SAFE_POD) },
  'iac:k8s-privilege-escalation-not-disabled': {
    lang: 'yaml',
    bad: k8s(['          resources:', '            limits:', '              cpu: 500m'], SAFE_POD),
    good: k8s(SAFE_CONTAINER, SAFE_POD),
  },
  'iac:k8s-run-as-non-root-missing': {
    lang: 'yaml',
    bad: k8s(['          securityContext:', '            allowPrivilegeEscalation: false'], SAFE_POD),
    good: k8s(SAFE_CONTAINER, SAFE_POD),
  },
  'iac:k8s-automount-token': { lang: 'yaml', bad: k8s(SAFE_CONTAINER), good: k8s(SAFE_CONTAINER, SAFE_POD) },
  'iac:k8s-secret-in-env': {
    lang: 'yaml',
    bad: k8s([...SAFE_CONTAINER, '          env:', '            - name: DB_PASSWORD', '              value: hunter2pass'], SAFE_POD),
    good: k8s([...SAFE_CONTAINER, '          env:', '            - name: DB_PASSWORD', '              valueFrom:', '                secretKeyRef:', '                  name: db', '                  key: password'], SAFE_POD),
  },
  'iac:k8s-loadbalancer-open': {
    lang: 'yaml',
    bad: lines('apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', 'spec:', '  type: LoadBalancer', '  ports:', '    - port: 443'),
    good: lines('apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', 'spec:', '  type: LoadBalancer', '  loadBalancerSourceRanges:', '    - 203.0.113.0/24', '  ports:', '    - port: 443'),
  },
  'iac:ansible-validate-certs-off': {
    lang: 'yaml',
    bad: play('    - name: fetch', '      get_url:', '        url: https://example.com/a.tgz', '        dest: /tmp/a.tgz', '        validate_certs: no'),
    good: play('    - name: fetch', '      get_url:', '        url: https://example.com/a.tgz', '        dest: /tmp/a.tgz', '        validate_certs: yes'),
  },
  'iac:ansible-shell-with-variables': {
    lang: 'yaml',
    bad: play('    - name: cleanup', '      shell: rm -rf {{ target_dir }}/cache'),
    good: play('    - name: cleanup', '      shell: rm -rf {{ target_dir | quote }}/cache'),
  },
  'iac:ansible-become-without-user': {
    lang: 'yaml',
    bad: play('    - name: restart', '      become: yes', '      service:', '        name: app', '        state: restarted'),
    good: play('    - name: restart', '      become: yes', '      become_user: app', '      service:', '        name: app', '        state: restarted'),
  },
  'iac:ansible-no-log-missing': {
    lang: 'yaml',
    bad: play('    - name: create db user', '      postgresql_user:', '        name: app', '        password: "{{ db_password }}"'),
    good: play('    - name: create db user', '      no_log: true', '      postgresql_user:', '        name: app', '        password: "{{ db_password }}"'),
  },
  'iac:ansible-hardcoded-password': {
    lang: 'yaml',
    bad: play('    - name: create db user', '      no_log: true', '      postgresql_user:', '        name: app', '        password: Pa55word!'),
    good: play('    - name: create db user', '      no_log: true', '      postgresql_user:', '        name: app', '        password: "{{ vault_db_password }}"'),
  },
  'iac:ansible-world-writable-mode': {
    lang: 'yaml',
    bad: play('    - name: config', '      copy:', '        src: app.conf', '        dest: /etc/app.conf', "        mode: '0777'"),
    good: play('    - name: config', '      copy:', '        src: app.conf', '        dest: /etc/app.conf', "        mode: '0640'"),
  },
  'iac:ansible-http-url': {
    lang: 'yaml',
    bad: play('    - name: fetch', '      get_url:', '        url: http://example.com/a.tgz', '        dest: /tmp/a.tgz'),
    good: play('    - name: fetch', '      get_url:', '        url: https://example.com/a.tgz', '        dest: /tmp/a.tgz'),
  },
  'iac:ansible-ignore-errors': {
    lang: 'yaml',
    bad: play('    - name: migrate', '      command: /opt/app/migrate', '      ignore_errors: yes'),
    good: play('    - name: migrate', '      command: /opt/app/migrate', '      register: out', '      failed_when: out.rc > 1'),
  },
  'iac:ansible-state-latest': {
    lang: 'yaml',
    bad: play('    - name: nginx', '      apt:', '        name: nginx', '        state: latest'),
    good: play('    - name: nginx', '      apt:', '        name: nginx=1.24.0-1', '        state: present'),
  },
  'iac:arm-secret-param-not-secure': {
    lang: 'json',
    bad: arm('  "parameters": {', '    "adminPassword": {', '      "type": "string"', '    }', '  },', '  "resources": []'),
    good: arm('  "parameters": {', '    "adminPassword": {', '      "type": "securestring"', '    }', '  },', '  "resources": []'),
  },
  'iac:arm-secret-default-value': {
    lang: 'json',
    bad: arm('  "parameters": {', '    "adminPassword": {', '      "type": "securestring",', '      "defaultValue": "P@ssw0rd123"', '    }', '  },', '  "resources": []'),
    good: arm('  "parameters": {', '    "adminPassword": {', '      "type": "securestring"', '    }', '  },', '  "resources": []'),
  },
  'iac:arm-public-network-access': { lang: 'json', bad: armRes('        "publicNetworkAccess": "Enabled"'), good: armRes('        "publicNetworkAccess": "Disabled"') },
  'iac:arm-min-tls-version': { lang: 'json', bad: armRes('        "minimumTlsVersion": "TLS1_0"'), good: armRes('        "minimumTlsVersion": "TLS1_2"') },
  'iac:arm-https-only-false': { lang: 'json', bad: armRes('        "supportsHttpsTrafficOnly": false'), good: armRes('        "supportsHttpsTrafficOnly": true') },
  'iac:arm-blob-public-access': { lang: 'json', bad: armRes('        "allowBlobPublicAccess": true'), good: armRes('        "allowBlobPublicAccess": false') },
  'iac:arm-open-nsg-rule': {
    lang: 'json',
    bad: armRes('        "securityRules": [', '          { "name": "ssh", "properties": { "direction": "Inbound", "access": "Allow", "sourceAddressPrefix": "*", "destinationPortRange": "22" } }', '        ]'),
    good: armRes('        "securityRules": [', '          { "name": "deny", "properties": { "direction": "Inbound", "access": "Deny", "sourceAddressPrefix": "*", "destinationPortRange": "*" } }', '        ]'),
  },
  'iac:arm-ftps-all-allowed': { lang: 'json', bad: armRes('        "ftpsState": "AllAllowed"'), good: armRes('        "ftpsState": "Disabled"') },
  'iac:bicep-secure-param': {
    lang: 'bicep',
    bad: lines("@description('Admin password')", 'param adminPassword string', "param location string = 'koreacentral'"),
    good: lines("@description('Admin password')", '@secure()', 'param adminPassword string', 'param keyVaultName string'),
  },
};

function keysFor(text, lang, path = 'infra/stack.' + (lang === 'bicep' ? 'bicep' : lang === 'json' ? 'json' : 'yaml')) {
  return iac.analyze([{ path, text, lang }], { inactive: new Set() });
}

test('iac catalog entries are well formed with en and ko texts', () => {
  const cat = iac.catalog();
  assert.ok(cat.length >= 30, `rules: ${cat.length}`);
  const seen = new Set();
  for (const r of cat) {
    assert.match(r.key, /^iac:[a-z0-9]+(?:-[a-z0-9]+)*$/, r.key);
    assert.ok(!seen.has(r.key), `duplicate ${r.key}`);
    seen.add(r.key);
    assert.ok(TYPES.has(r.type), `${r.key} type`);
    assert.ok(SEVERITIES.has(r.severity), `${r.key} severity`);
    assert.ok(r.debtMin > 0, `${r.key} debt`);
    assert.equal(r.re, undefined);
    assert.equal(r.check, undefined);
    for (const l of r.langs) assert.ok(LANGS[l], `${r.key} lang ${l}`);
    for (const t of r.tags) assert.equal(t, t.toLowerCase());
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(r[f].en.trim(), `${r.key} ${f}.en`);
      assert.match(r[f].ko, /[가-힣]/, `${r.key} ${f}.ko`);
    }
  }
});

test('every iac rule has fixtures', () => {
  for (const r of iac.catalog()) assert.ok(FIXTURES[r.key], `missing fixture for ${r.key}`);
  for (const key of Object.keys(FIXTURES)) assert.ok(iac.catalog().some((r) => r.key === key), `fixture for unknown rule ${key}`);
});

for (const [key, fx] of Object.entries(FIXTURES)) {
  test(`${key} flags the non-compliant file and spares the compliant one`, () => {
    const bad = keysFor(fx.bad, fx.lang).filter((f) => f.rule === key);
    assert.ok(bad.length > 0, `${key} should flag:\n${fx.bad}`);
    for (const f of bad) {
      assert.ok(Number.isInteger(f.line) && f.line >= 1, `${key} line`);
      assert.ok(f.message.en && f.message.ko, `${key} message`);
    }
    const good = keysFor(fx.good, fx.lang).filter((f) => f.rule === key);
    assert.deepEqual(good.map((f) => f.line), [], `${key} should not flag:\n${fx.good}`);
  });
}

test('format detection is content based', () => {
  const fmt = (t, l, p) => [...iac.formatsOf(t, l, p)].sort();
  assert.deepEqual(fmt(FIXTURES['iac:cfn-rds-public'].bad, 'yaml'), ['cfn']);
  assert.deepEqual(fmt(FIXTURES['iac:k8s-automount-token'].bad, 'yaml'), ['k8s']);
  assert.deepEqual(fmt(FIXTURES['iac:ansible-ignore-errors'].bad, 'yaml'), ['ansible']);
  assert.deepEqual(fmt(FIXTURES['iac:arm-ftps-all-allowed'].bad, 'json'), ['arm']);
  assert.deepEqual(fmt('{ "Resources": { "B": { "Type": "AWS::S3::Bucket" } } }', 'json'), ['cfn']);
  assert.deepEqual(fmt('- name: x\n  apt:\n    name: git\n', 'yaml', 'roles/web/tasks/main.yml'), ['ansible']);
  assert.deepEqual(fmt('name: app\nversion: 1\n', 'yaml'), []);
});

test('rules do not fire on files of another kind', () => {
  // Plain configuration that only looks like IaC keys.
  const plain = keysFor(lines('server:', '  validate_certs: no', '  state: latest', '  privileged: true'), 'yaml');
  assert.deepEqual(plain, []);
  const json = keysFor(lines('{', '  "publicNetworkAccess": "Enabled",', '  "minimumTlsVersion": "TLS1_0"', '}'), 'json');
  assert.deepEqual(json, []);
  assert.deepEqual(iac.analyze([{ path: 'a.js', text: 'const x = { publicNetworkAccess: "Enabled" };', lang: 'js' }], {}), []);
});

test('cloudformation json templates are checked by resource', () => {
  const text = lines(
    '{',
    '  "AWSTemplateFormatVersion": "2010-09-09",',
    '  "Resources": {',
    '    "Db": {',
    '      "Type": "AWS::RDS::DBInstance",',
    '      "Properties": { "Engine": "mysql", "PubliclyAccessible": true }',
    '    },',
    '    "Sg": {',
    '      "Type": "AWS::EC2::SecurityGroup",',
    '      "Properties": { "SecurityGroupIngress": [',
    '        { "IpProtocol": "tcp", "FromPort": 3389, "ToPort": 3389, "CidrIp": "0.0.0.0/0" },',
    '        { "IpProtocol": "tcp", "FromPort": 443, "ToPort": 443, "CidrIp": "0.0.0.0/0" }',
    '      ] }',
    '    }',
    '  }',
    '}');
  const found = keysFor(text, 'json').map((f) => `${f.rule}@${f.line}`);
  assert.ok(found.includes('iac:cfn-rds-public@6'), found.join(', '));
  assert.ok(found.includes('iac:cfn-rds-unencrypted@5'), found.join(', '));
  assert.ok(found.includes('iac:cfn-sg-open-admin-port@11'), found.join(', '));
  assert.ok(!found.includes('iac:cfn-sg-open-admin-port@12'), found.join(', '));
});

test('multi-document yaml reports lines in file coordinates', () => {
  const text = lines('name: settings', '---', FIXTURES['iac:k8s-loadbalancer-open'].bad);
  const hits = keysFor(text, 'yaml').filter((f) => f.rule === 'iac:k8s-loadbalancer-open');
  assert.deepEqual(hits.map((f) => f.line), [8]);
});

test('comments and inactive rules are respected', () => {
  const commented = play('    - name: fetch', '      get_url:', '        url: https://example.com/a.tgz', '        # validate_certs: no');
  assert.equal(keysFor(commented, 'yaml').filter((f) => f.rule === 'iac:ansible-validate-certs-off').length, 0);
  const fx = FIXTURES['iac:cfn-rds-public'];
  const off = iac.analyze([{ path: 's.yaml', text: fx.bad, lang: 'yaml' }], { inactive: new Set(['iac:cfn-rds-public']) });
  assert.equal(off.filter((f) => f.rule === 'iac:cfn-rds-public').length, 0);
});

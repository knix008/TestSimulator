'use strict';

// File-name -> parser registry. Each parser returns a ParsedFile:
//   { ecosystem, kind: 'manifest'|'lock'|'sbom', file, project?, deps: [...] }
// dep: { name, version?, spec?, scope?, line, direct?, license?, key?, edges?,
//        requires?: [{ name, spec?, version? }], resolved?, deprecated? }

const { basename } = require('../util');
const npm = require('./npm');
const python = require('./python');
const jvm = require('./jvm');
const native = require('./native');
const other = require('./other');

const REGISTRY = [
  { test: (b) => b === 'package.json', parse: npm.parsePackageJson, eco: 'npm' },
  { test: (b) => b === 'package-lock.json' || b === 'npm-shrinkwrap.json', parse: npm.parsePackageLock, eco: 'npm', priority: 1 },
  { test: (b) => b === 'pnpm-lock.yaml' || b === 'pnpm-lock.yml', parse: npm.parsePnpmLock, eco: 'npm', priority: 2 },
  { test: (b) => b === 'yarn.lock', parse: npm.parseYarnLock, eco: 'npm', priority: 3 },
  { test: (b, p) => /requirements.*\.(txt|in)$/i.test(b) || /(^|\/)requirements\/[^/]+\.txt$/i.test(p) || /^(constraints|dev-requirements|test-requirements)\.txt$/i.test(b), parse: python.parseRequirements, eco: 'PyPI' },
  { test: (b) => b === 'Pipfile', parse: python.parsePipfile, eco: 'PyPI' },
  { test: (b) => b === 'Pipfile.lock', parse: python.parsePipfileLock, eco: 'PyPI', priority: 2 },
  { test: (b) => b === 'poetry.lock', parse: python.parsePoetryLock, eco: 'PyPI', priority: 1 },
  { test: (b) => b === 'uv.lock', parse: python.parseUvLock, eco: 'PyPI', priority: 1 },
  { test: (b) => b === 'pyproject.toml', parse: python.parsePyproject, eco: 'PyPI' },
  { test: (b) => b === 'pom.xml', parse: jvm.parsePom, eco: 'Maven' },
  { test: (b) => b === 'build.gradle' || b === 'build.gradle.kts', parse: jvm.parseGradle, eco: 'Maven' },
  { test: (b) => b === 'gradle.lockfile' || /^buildscript-gradle\.lockfile$/.test(b), parse: jvm.parseGradleLockfile, eco: 'Maven', priority: 1 },
  { test: (b) => b === 'go.mod', parse: native.parseGoMod, eco: 'Go' },
  { test: (b) => b === 'go.sum', parse: native.parseGoSum, eco: 'Go', priority: 9 },
  { test: (b) => b === 'Cargo.toml', parse: native.parseCargoToml, eco: 'crates.io' },
  { test: (b) => b === 'Cargo.lock', parse: native.parseCargoLock, eco: 'crates.io', priority: 1 },
  { test: (b) => b === 'Gemfile' || b === 'gems.rb', parse: native.parseGemfile, eco: 'RubyGems' },
  { test: (b) => b === 'Gemfile.lock' || b === 'gems.locked', parse: native.parseGemfileLock, eco: 'RubyGems', priority: 1 },
  { test: (b) => b === 'composer.json', parse: native.parseComposerJson, eco: 'Packagist' },
  { test: (b) => b === 'composer.lock', parse: native.parseComposerLock, eco: 'Packagist', priority: 1 },
  { test: (b) => /\.(cs|fs|vb)proj$/i.test(b) || /^Directory\.(Packages|Build)\.props$/i.test(b), parse: other.parseMsbuild, eco: 'NuGet' },
  { test: (b) => b.toLowerCase() === 'packages.config', parse: other.parsePackagesConfig, eco: 'NuGet' },
  { test: (b) => b.toLowerCase() === 'packages.lock.json', parse: other.parseNugetLock, eco: 'NuGet', priority: 1 },
  { test: (b) => /\.nuspec$/i.test(b), parse: other.parseNuspec, eco: 'NuGet' },
  { test: (b) => b === 'conanfile.txt', parse: other.parseConanfileTxt, eco: 'ConanCenter' },
  { test: (b) => b === 'conanfile.py', parse: other.parseConanfilePy, eco: 'ConanCenter' },
  { test: (b) => b === 'conan.lock', parse: other.parseConanLock, eco: 'ConanCenter', priority: 1 },
  { test: (b) => b === 'vcpkg.json', parse: other.parseVcpkgJson, eco: 'vcpkg' },
  { test: (b) => b === 'Package.resolved', parse: other.parsePackageResolved, eco: 'SwiftURL', priority: 1 },
  { test: (b) => b === 'Package.swift', parse: other.parsePackageSwift, eco: 'SwiftURL' },
  { test: (b) => b === 'pubspec.lock', parse: other.parsePubspecLock, eco: 'Pub', priority: 1 },
  { test: (b) => b === 'pubspec.yaml', parse: other.parsePubspecYaml, eco: 'Pub' },
  {
    test: (b) => /\.(cdx|bom)\.(json|xml)$/i.test(b) || /^(bom|sbom)\.(json|xml)$/i.test(b) || /\.spdx(\.json)?$/i.test(b),
    parse: (text, file) => require('../sbom').parseSbomFile(text, file),
    eco: 'sbom', sbom: true,
  },
];

function parserFor(filePath) {
  const p = String(filePath).replace(/\\/g, '/');
  const b = basename(p);
  return REGISTRY.find((r) => r.test(b, p)) || null;
}

function isManifest(filePath) {
  return !!parserFor(filePath);
}

function parseFile(file, text, ctx) {
  const entry = parserFor(file);
  if (!entry) return null;
  const out = entry.parse(text, file, ctx || {});
  if (out) out.priority = entry.priority || 0;
  return out;
}

module.exports = { REGISTRY, parserFor, isManifest, parseFile };

const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('../src/substore/convert');

// Frozen category memberships for regression cases; no live upstream dependency.
const cases = [
  ['api.githubcopilot.com', ['geosite:category-dev', 'geosite:category-ai-chat-!cn'], '人工智能'],
  ['api.jetbrains.ai', ['geosite:category-dev', 'geosite:category-ai-chat-!cn'], '人工智能'],
  ['play.google.com', ['geosite:google-play', 'geosite:google', 'geosite:cn'], 'Google'],
  ['www.baidu.com', ['geosite:cn', 'geoip:cn'], '全球直连'],
  ['nas.drj028.com', ['rule-set:forcedirect'], '全球直连'],
  ['openclaw-service.yoooclaw.com', ['rule-set:forcedirect', 'geosite:category-ai-chat-!cn'], '全球直连'],
  ['router.lan', ['geosite:private', 'geoip:private'], '全球直连'],
  ['192.168.1.1', ['geoip:private'], '全球直连'],
  ['unknown.example', [], '节点选择']
];

test('YoooClaw bridge bypasses the proxy without covering sibling domains', () => {
  const payload = require('../src/data/rulesets')['forcedirect.yaml'];
  const domain = 'openclaw-service.yoooclaw.com';
  assert.ok(payload.includes(domain));
  assert.ok(!payload.includes('+.yoooclaw.com'));
});

function matchesAtom(atom, tags, network, port) {
  const [kind, value] = atom.toLowerCase().split(',');
  if (kind === 'network') return value === network;
  if (kind === 'dst-port') return Number(value) === port;
  if (kind === 'match') return true;
  assert.ok(['geosite', 'geoip', 'rule-set'].includes(kind), `unsupported test matcher: ${kind}`);
  return tags.includes(`${kind}:${value}`);
}

function mihomoResult(rules, tags, network, port) {
  for (const rule of rules) {
    if (rule.startsWith('AND,')) {
      const atoms = [...rule.matchAll(/\(([^()]+)\)/g)].map((match) => match[1]);
      if (atoms.every((atom) => matchesAtom(atom, tags, network, port))) return 'REJECT';
    } else if (matchesAtom(rule, tags, network, port)) {
      const parts = rule.split(',');
      return parts[0] === 'match' ? parts[1] : parts[2];
    }
  }
}

test('Mihomo preserves first-match routing and scopes QUIC to proxy policies', () => {
  for (const enabled of [false, true]) {
    global.$arguments = { quic: enabled };
    delete require.cache[require.resolve('../src/substore/convert')];
    const clash = require('../src/substore/convert').main({}).rules;
    for (const [domain, tags, policy] of cases) {
      for (const network of ['tcp', 'udp']) {
        const expected = !enabled && network === 'udp' && policy !== '全球直连' ? 'REJECT' : policy;
        assert.equal(mihomoResult(clash, tags, network, 443), expected, `Mihomo ${domain} ${network}`);
      }
    }
  }
});

test('Mihomo preserves Geo update ownership', () => {
  const config = main({});
  assert.equal(config.dns['fake-ip-range'], '198.18.0.1/16');
  assert.equal(config['geo-auto-update'], true);
  assert.equal(config['geo-update-interval'], 24);
  assert.equal(main({ 'geo-auto-update': false })['geo-auto-update'], false);
  assert.equal(main({ 'geo-update-interval': 48 })['geo-update-interval'], 48);
});

test('strict lint catches suffix coverage without confusing sibling domains', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-lint-'));
  try {
    const file = path.join(dir, 'sample.yaml');
    const lint = () => spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/lint-rules.js'), '--strict'], { cwd: dir, encoding: 'utf8' });
    fs.writeFileSync(file, 'payload:\n  - +.example.com\n  - +.api.example.com\n');
    const covered = lint();
    assert.equal(covered.status, 1);
    assert.match(covered.stdout, /REDUNDANT.*api.example.com/);
    fs.writeFileSync(file, 'payload:\n  - +.example.com\n  - +.otherexample.com\n');
    assert.equal(lint().status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Mihomo keeps the minimal domestic DNS baseline without proxy dependencies', () => {
  const first = main({});
  const dns = first.dns;
  for (const key of ['nameserver-policy', 'direct-nameserver', 'proxy-server-nameserver', 'direct-nameserver-follow-policy', 'respect-rules', 'fallback']) {
    assert.equal(dns[key], undefined, key);
  }
  assert.deepEqual(dns.nameserver, ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query']);
  assert.deepEqual(dns['default-nameserver'], ['tls://223.5.5.5', 'tls://223.6.6.6']);
  for (const key of ['default-nameserver', 'nameserver', 'fake-ip-filter']) {
    dns[key].push('invalid');
    assert.ok(!main({}).dns[key].includes('invalid'));
  }
  assert.ok(dns['fake-ip-filter'].includes('geosite:cn'));
  assert.ok(dns['fake-ip-filter'].includes('rule-set:cnsite'));
  assert.ok(dns['fake-ip-filter'].includes('rule-set:fakeipfilter'));
  const group = first['proxy-groups'].find((item) => item.name === 'DNS代理');
  assert.equal(group, undefined);
});

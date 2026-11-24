'use strict';

const chartMetrics = {
  ssim: { label: 'SSIM', color: '#86c7f1', digits: 3 },
  lpips: { label: 'LPIPS', color: '#c9a4ee', digits: 3, lower: true },
  move: { label: 'Move-Acc', color: '#6ad0c4', digits: 0, percent: true },
  attack: { label: 'Att-Acc', color: '#efd074', digits: 0, percent: true },
  rvsa: { label: 'RVSA', color: '#ed94b4', digits: 3 },
  gemini: { label: 'Mechanics fidelity · Gemini', color: '#a9d981', digits: 1, percent: true },
  gpt: { label: 'Mechanics fidelity · GPT', color: '#ffad7d', digits: 1, percent: true },
};

const charts = {
  benchmarks: {
    columns: ['ssim', 'lpips', 'move', 'attack', 'rvsa', 'gemini', 'gpt'],
    order: ['gemini', 'gpt', 'ssim', 'lpips', 'move', 'attack', 'rvsa'],
    note: 'Each chart compares FireGame with the strongest fine-tuned baseline for that metric and benchmark. Bars show the difference between the displayed scores. Positive values indicate better performance. The full tables include all methods, zero-shot results, and standard deviations.',
  },
  components: {
    columns: ['ssim', 'gemini', 'gpt'],
    order: ['gemini', 'gpt', 'ssim'],
    note: 'Differences are measured against supervised fine-tuning (SFT). Positive values indicate better performance.',
  },
  schedule: {
    columns: ['ssim', 'lpips', 'gemini', 'gpt'],
    order: ['ssim', 'lpips', 'gemini', 'gpt'],
    note: 'Differences are measured against SFT + GTT on StreetBench. Positive values indicate better performance.',
  },
};

function element(tag, className, content) {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function readScores(tableId, bodyIndex, column) {
  const table = document.getElementById(tableId);
  return [...table.tBodies[bodyIndex].rows].flatMap(row => {
    const name = row.querySelector('th[scope="row"]');
    const mean = row.cells[column + 1]?.textContent.trim().split('±')[0].trim();
    if (!name || !Number.isFinite(Number.parseFloat(mean))) return [];
    return [{ name: name.textContent.trim(), mean, value: Number(mean), highlight: row.classList.contains('ours-row') }];
  });
}

function performanceGap(value, reference, metric) {
  const difference = metric.lower ? reference - value : value - reference;
  return Number(difference.toFixed(metric.digits));
}

function groupsFor(kind, config, key) {
  const metric = chartMetrics[key];
  const column = config.columns.indexOf(key);
  if (kind === 'schedule') {
    const [reference, ...scores] = readScores('schedule-results', 0, column);
    return [{ name: 'StreetBench', reference, scores }];
  }
  return ['StreetBench', 'FightBench'].map((name, index) => {
    if (kind === 'components') {
      const [reference, ...scores] = readScores('component-results', 0, column + index * config.columns.length);
      return { name, reference, scores };
    }
    const table = index === 0 ? 'street-results' : 'fight-results';
    const scores = readScores(table, 1, column);
    const ours = scores.find(score => score.highlight);
    const baseline = scores.filter(score => !score.highlight).reduce((best, score) =>
      performanceGap(score.value, best.value, metric) > 0 ? score : best,
    );
    return { name, reference: baseline, scores: [ours] };
  });
}

function axisLimit(groups, metric) {
  const peak = Math.max(...groups.flatMap(({ reference, scores }) =>
    scores.map(score => Math.abs(performanceGap(score.value, reference.value, metric))),
  ));
  if (!peak) return metric.percent ? 1 : 0.01;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const step = [1, 1.5, 2, 3, 5, 8, 10].find(value => value * magnitude >= peak - 1e-10);
  return Number((step * magnitude).toPrecision(4));
}

function signed(value, digits) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return sign + Math.abs(value).toFixed(digits);
}

function scoreLabel(score, metric) {
  return score.mean + (metric.percent ? '%' : '');
}

function chartRow(score, reference, metric, limit) {
  const delta = performanceGap(score.value, reference.value, metric);
  const row = element('li', score.highlight ? 'metric-row metric-highlight' : 'metric-row');
  const name = element('span', 'metric-name', score.name + ' ');
  name.append(element('strong', 'metric-score', scoreLabel(score, metric)));

  const track = element('span', 'metric-track');
  track.setAttribute('aria-hidden', 'true');
  if (delta) {
    const fill = element('span', delta < 0 ? 'metric-fill metric-negative' : 'metric-fill');
    fill.style.width = `${Math.min(50, Math.abs(delta) / limit * 50)}%`;
    track.append(fill);
  }
  const value = element('strong', 'metric-delta', signed(delta, metric.digits) + (metric.percent ? ' pp' : ''));
  row.append(name, track, value);
  return row;
}

function chartGroup(group, kind, metric, limit) {
  const block = element('div', 'metric-group');
  const heading = element('div', 'metric-group-heading');
  heading.append(element('h4', '', group.name));
  const prefix = kind === 'benchmarks' ? 'Best baseline · ' : '';
  const baseline = element('span', 'metric-reference', prefix + group.reference.name + ' ');
  baseline.append(element('strong', '', scoreLabel(group.reference, metric)));
  heading.append(baseline);

  const bars = element('ul', 'metric-bars');
  bars.append(...group.scores.map(score => chartRow(score, group.reference, metric, limit)));
  block.append(heading, bars);
  return block;
}

function metricCard(kind, config, key) {
  const metric = chartMetrics[key];
  const groups = groupsFor(kind, config, key);
  const limit = axisLimit(groups, metric);
  const card = element('div', 'metric-card');
  card.style.setProperty('--metric-color', metric.color);
  const header = element('div', 'metric-card-heading');
  header.append(
    element('h3', 'metric-title', metric.label),
    element('span', 'metric-direction', metric.lower ? 'Lower is better' : 'Higher is better'),
  );
  card.append(header, ...groups.map(group => chartGroup(group, kind, metric, limit)));

  const axis = element('div', 'metric-axis');
  const tickDigits = String(limit).split('.')[1]?.length || 0;
  const suffix = metric.percent ? ' pp' : '';
  const ticks = element('div', 'metric-ticks');
  ticks.append(
    element('span', '', signed(-limit, tickDigits) + suffix),
    element('span', '', '0'),
    element('span', '', signed(limit, tickDigits) + suffix),
  );
  axis.setAttribute('aria-label', `Difference scale ${signed(-limit, tickDigits)} to ${signed(limit, tickDigits)}${suffix}`);
  axis.append(ticks);
  card.append(axis);
  return card;
}

function mountChart(chart) {
  const kind = chart.dataset.chart;
  const config = charts[kind];
  const grid = element('div', 'metric-grid');
  const cards = config.order.map(key => metricCard(kind, config, key));
  grid.append(...cards);
  chart.append(element('p', 'metric-note', config.note), grid);
  chart.hidden = false;

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('metric-animated');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.16 });
    cards.forEach(card => observer.observe(card));
  }
}

document.querySelectorAll('.metric-chart').forEach(mountChart);

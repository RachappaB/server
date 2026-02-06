function toDate(input) {
  return input instanceof Date ? input : new Date(input);
}

function getISTParts(input) {
  const d = toDate(input);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(d);
  const get = (t) => Number(parts.find(p => p.type === t).value);

  return { hour: get('hour'), minute: get('minute') };
}

function getISTBucket(input) {
  const { hour, minute } = getISTParts(input);
  const total = (hour * 60) + minute;
  return Math.floor(total / 15);
}

function toISTDateString(input) {
  const d = toDate(input);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

module.exports = { getISTParts, getISTBucket, toISTDateString };

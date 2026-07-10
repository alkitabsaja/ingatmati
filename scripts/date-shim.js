// Minimal date formatter so we don't need to pull in luxon just for
// one filter. Mimics the tiny slice of the DateTime API we use.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DateTime = {
  fromISO(isoString) {
    const d = new Date(isoString);
    return {
      toFormat(_fmt) {
        if (isNaN(d.getTime())) return isoString;
        return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      },
    };
  },
};

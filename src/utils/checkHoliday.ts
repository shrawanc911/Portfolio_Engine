const holidays = [
  "Mon, 26 Jan 2026", // Republic Day
  "Tue, 03 Mar 2026", // Holi
  "Thu, 26 Mar 2026", // Shri Ram Navami
  "Tue, 31 Mar 2026", // Shri Mahavir Jayanti
  "Fri, 03 Apr 2026", // Good Friday
  "Tue, 14 Apr 2026", // Dr. Baba Saheb Ambedkar Jayanti
  "Fri, 01 May 2026", // Maharashtra Day
  "Thu, 28 May 2026", // Bakri Id (Eid ul-Adha)
  "Fri, 26 Jun 2026", // Muharram
  "Mon, 14 Sep 2026", // Ganesh Chaturthi
  "Fri, 02 Oct 2026", // Mahatma Gandhi Jayanti
  "Tue, 20 Oct 2026", // Dussehra
  "Tue, 10 Nov 2026", // Diwali-Balipratipada
  "Tue, 24 Nov 2026", // Prakash Gurpurb Sri Guru Nanak Dev
  "Fri, 25 Dec 2026", // Christmas
  "Sat",
  "Sun",
];

export function isMarketClosedToday(): boolean {
  const now = new Date();

  // Shift to IST (UTC+5:30)
  const istOffset = 330 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);

  const day = istDate.getUTCDay(); // 0=Sun, 6=Sat (using UTC methods on shifted date)

  if (day === 0 || day === 6) return true;

  const todayStr = istDate.toUTCString().slice(0, 16);
  return holidays.includes(todayStr);
}

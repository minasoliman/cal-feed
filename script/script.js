// --- CONFIGURATION ---
const calendarUrl = "https://corsproxy.io/?https://calendar.google.com/calendar/ical/f0dab7f7ee3cd0f82d0a24dc33c994b3cd1c650af898d3cce6e5cd850f79a3a2%40group.calendar.google.com/public/basic.ics";
let weekOffset = 0; // 0 = this week, -1 = last week, +1 = next week
const MAX_OCCURRENCES = 20; // Prevent infinite loops for bad RRULEs

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs && mins) return `${hrs}h ${mins}m`;
  if (hrs) return `${hrs}h`;
  return `${mins}m`;
}

// --- MAIN FUNCTION ---

async function fetchAndParseICS() {
  try {
    const response = await fetch(calendarUrl);
    const data = await response.text();
    const jcalData = ICAL.parse(data);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents("vevent");

    const weekEvents = {
      Sunday: [], Monday: [], Tuesday: [], Wednesday: [],
      Thursday: [], Friday: [], Saturday: []
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + (weekOffset * 7));
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // End on Saturday
    endOfWeek.setHours(23, 59, 59, 999); // Include full Saturday

    vevents.forEach((vevent) => {
      try {
        const event = new ICAL.Event(vevent);
        if (!event.startDate || !event.summary) return;

        const baseStart = event.startDate.toJSDate();
        let durationMs = 0;
        if (event.endDate) {
          durationMs = event.endDate.toJSDate() - baseStart;
        } else if (event.duration) {
          durationMs = event.duration.toSeconds() * 1000;
        }

        const rrule = vevent.getFirstPropertyValue("rrule");

        const pushEvent = (startDate) => {
          const endDate = new Date(startDate.getTime() + durationMs);
          const weekday = getWeekdayKey(startDate);
          weekEvents[weekday]?.push({
            start: startDate,
            end: endDate,
            summary: event.summary,
            durationMs,
          });
        };

        if (rrule) {
          const expand = new ICAL.RecurExpansion({
            component: vevent,
            dtstart: event.startDate,
          });

          let next;
          let count = 0;
          while ((next = expand.next()) && count < MAX_OCCURRENCES) {
            count++;
            const startDate = next.toJSDate();
            if (startDate >= startOfWeek && startDate <= endOfWeek) {
              pushEvent(startDate);
            }
          }
        } else {
          const startDate = baseStart;
          if (startDate >= startOfWeek && startDate <= endOfWeek) {
            pushEvent(startDate);
          }
        }
      } catch (eventError) {
        console.warn("Skipping event due to error:", eventError);
      }
    });

    return { weekEvents, startOfWeek };
  } catch (error) {
    console.error("Failed to load ICS:", error);
    return null;
  }
  

}

function getWeekdayKey(date) {
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return weekdays[date.getDay()];
}

function renderSchedule({ weekEvents, startOfWeek }) {
  const scheduleTable = document.getElementById("schedule-table");
  scheduleTable.innerHTML = "";

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  days.forEach((day, i) => {
    const dayBlock = document.createElement("div");
    dayBlock.classList.add("day-block");

    const currentDate = new Date(startOfWeek);
    currentDate.setDate(currentDate.getDate() + i);
    const dateStr = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const header = document.createElement("div");
    header.classList.add("day-header");
    header.textContent = `${dateStr}`;
    dayBlock.appendChild(header);

    const eventsContainer = document.createElement("div");
    const events = weekEvents[day];

    if (!events || events.length === 0) {
      eventsContainer.textContent = "No Events";
      eventsContainer.classList.add("no-events");
    } else {
      events
        .sort((a, b) => a.start - b.start)
        .forEach(event => {
          const div = document.createElement("div");
          const start = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const end = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const duration = formatDuration(event.durationMs);
          div.textContent = `${start} - ${end} (${duration}) - ${event.summary}`;
          div.classList.add("event-item");
          eventsContainer.appendChild(div);
        });
    }

    dayBlock.appendChild(eventsContainer);
    scheduleTable.appendChild(dayBlock);

    if (
      currentDate.toDateString() === new Date().toDateString()
    ) {
      dayBlock.classList.add("today");
    }

  });

  const wrapper = document.getElementById("schedule-wrapper");
  wrapper.className = "";
  if (weekOffset === 0) wrapper.classList.add("current-week");
  else if (weekOffset < 0) wrapper.classList.add("past-week");
  else wrapper.classList.add("future-week");
}

async function updateSchedule() {
  const result = await fetchAndParseICS();
  if (result) renderSchedule(result);
}


document.getElementById("prev-week").addEventListener("click", () => {
  weekOffset--;
  updateSchedule();
});

document.getElementById("next-week").addEventListener("click", () => {
  weekOffset++;
  updateSchedule();
});

document.getElementById("current-week").addEventListener("click", () => {
  weekOffset = 0;
  updateSchedule();
});



updateSchedule();

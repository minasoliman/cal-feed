// --- CONFIGURATION ---
const calendarUrl = "https://corsproxy.io/?https://calendar.google.com/calendar/ical/f0dab7f7ee3cd0f82d0a24dc33c994b3cd1c650af898d3cce6e5cd850f79a3a2%40group.calendar.google.com/public/basic.ics";
let weekOffset = 0;
const MAX_OCCURRENCES = 20;

// --- MAIN FUNCTION ---

async function fetchAndParseICS() {
  try {
    const response = await fetch(calendarUrl);
    const data = await response.text();
    const jcalData = ICAL.parse(data);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents("vevent");

    const weekEvents = {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + (weekOffset * 7));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek.getTime());
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    endOfWeek.setHours(23, 59, 59, 999);

    vevents.forEach((vevent) => {
      try {
        const event = new ICAL.Event(vevent);
        if (!event.startDate || !event.summary) return;

        const rrule = vevent.getFirstPropertyValue("rrule");

        const processInstance = (startDateObj, duration) => {
          const startDate = startDateObj.toJSDate();
          const endDate = new Date(startDate.getTime() + duration.toSeconds() * 1000);

          // ✅ Use LOCAL DATE (not UTC)
          const dateKey = startDate.getFullYear() + "-" +
                          String(startDate.getMonth() + 1).padStart(2, '0') + "-" +
                          String(startDate.getDate()).padStart(2, '0');

          const timeString = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const endTimeString = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          const durationMs = endDate - startDate;
          const durationMinutes = Math.floor(durationMs / 60000);
          const hours = Math.floor(durationMinutes / 60);
          const minutes = durationMinutes % 60;
          const durationStr = `${hours}h ${minutes}m`;

          if (!weekEvents[dateKey]) weekEvents[dateKey] = [];
          weekEvents[dateKey].push({
            time: timeString,
            endTime: endTimeString,
            duration: durationStr,
            summary: event.summary
          });
        };

        const duration = event.duration || new ICAL.Duration({ minutes: 60 });

        if (rrule) {
          const expand = new ICAL.RecurExpansion({
            component: vevent,
            dtstart: event.startDate,
          });

          let next;
          let count = 0;
          while ((next = expand.next()) && count < MAX_OCCURRENCES) {
            count++;
            processInstance(next, duration);
          }
        } else {
          processInstance(event.startDate, duration);
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

function renderSchedule({ weekEvents, startOfWeek }) {
  const scheduleTable = document.getElementById("schedule-table");
  scheduleTable.innerHTML = "";

  const daysToRender = [];
  for (let i = 0; i <= 7; i++) {
    const currentDate = new Date(startOfWeek.getTime());
    currentDate.setDate(startOfWeek.getDate() + i);
    daysToRender.push(currentDate);
  }

  daysToRender.forEach(currentDate => {
    const dateKey = currentDate.getFullYear() + "-" +
                    String(currentDate.getMonth() + 1).padStart(2, '0') + "-" +
                    String(currentDate.getDate()).padStart(2, '0');

    const events = weekEvents[dateKey] || [];

    const dayBlock = document.createElement("div");
    dayBlock.classList.add("day-block");

    const dateStr = currentDate.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });

    const header = document.createElement("div");
    header.classList.add("day-header");
    header.textContent = dateStr;
    dayBlock.appendChild(header);

    const eventsContainer = document.createElement("div");

    if (events.length === 0) {
      eventsContainer.textContent = "No Events";
      eventsContainer.classList.add("no-events");
    } else {
      events.sort((a, b) => a.time.localeCompare(b.time)).forEach(event => {
        const div = document.createElement("div");
        div.textContent = `${event.time}–${event.endTime} (${event.duration}) - ${event.summary}`;
        div.classList.add("event-item");
        eventsContainer.appendChild(div);
      });
    }

    dayBlock.appendChild(eventsContainer);
    scheduleTable.appendChild(dayBlock);

    if (currentDate.toDateString() === new Date().toDateString()) {
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
  document.getElementById("prev-week").disabled = weekOffset <= MIN_WEEK_OFFSET;
  document.getElementById("next-week").disabled = weekOffset >= MAX_WEEK_OFFSET;
}

const MIN_WEEK_OFFSET = -3;
const MAX_WEEK_OFFSET = 3;

document.getElementById("prev-week").addEventListener("click", () => {
  if (weekOffset > MIN_WEEK_OFFSET) {
    weekOffset--;
    updateSchedule();
  }
});

document.getElementById("next-week").addEventListener("click", () => {
  if (weekOffset < MAX_WEEK_OFFSET) {
    weekOffset++;
    updateSchedule();
  }
});

document.getElementById("current-week").addEventListener("click", () => {
  weekOffset = 0;
  updateSchedule();
});

updateSchedule();

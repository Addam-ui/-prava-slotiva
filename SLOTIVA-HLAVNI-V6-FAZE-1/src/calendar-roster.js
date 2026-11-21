/**
 * Sloupce denního firemního kalendáře. Přístup ke konkrétním účtům už předtím
 * omezil calendarScope – zde se z bezpečnostních důvodů nikdy nedoplňuje další ID.
 * Rezervace majitele z dřívějších verzí neodstraníme ani neschováme, pokud existují.
 */
export function calendarRoster({ ids, periods, ownerId, isOwner, hasTeam, getPerson, getWorkingHours }) {
  return ids.map((id, i) => {
    const user = getPerson(id);
    return {
      id: Number(id),
      name: user?.name || 'Zaměstnanec',
      avatar: user?.avatar_data || '',
      isOwner: Number(id) === Number(ownerId),
      workingHours: getWorkingHours(id),
      hasEvents: Boolean(periods[i]?.bookings?.some(b => b.status !== 'cancelled') || periods[i]?.events?.length),
    };
  }).filter(person => !(isOwner && hasTeam && person.isOwner && !person.hasEvents));
}

import { useCrew, useIssToday } from '../data/queries';

/** Live ISS crew roster + "today aboard" feed, shown on the ISS detail panel. */
export function IssCrew() {
  const { data: crew } = useCrew(true);
  const { data: today } = useIssToday();

  const aboard = crew?.people.filter((p) => p.craft === 'ISS') ?? [];

  return (
    <div className="crew">
      <div className="label">Aboard right now</div>
      {aboard.length > 0 ? (
        <div className="crew__avatars">
          {aboard.map((p) => (
            <div key={p.name} className="crew__av" title={p.name}>
              <div className="crew__initials">
                {p.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </div>
              <div className="crew__last">{p.name.split(' ').pop()}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="info__lead">Crew roster unavailable offline.</div>
      )}
      {today?.activities && today.activities.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 12 }}>
            Today aboard
          </div>
          <ul className="crew__today">
            {today.activities.slice(0, 3).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

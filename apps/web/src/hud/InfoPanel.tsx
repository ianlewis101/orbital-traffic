import {
  CATEGORIES,
  orbitRegime,
  formatKm,
  formatSpeedKmS,
  formatSpeedMph,
  formatPeriod,
  formatLatLon,
  neoDiameterKm,
  type OrbitalObject,
  type NeoElements,
} from '@orbital/core';
import { useStore } from '../store/useStore';
import { useSelection, useTelemetry } from '../hooks/useSelection';
import {
  useDescriptions,
  useNeoDescriptions,
  useImageryManifest,
} from '../data/queries';
import { dataClient } from '../data/client';
import { IssCrew } from './IssCrew';
import { NeoOrbitDiagram } from './NeoOrbitDiagram';

const ISS_ID = '25544';

function photoKeyFor(o: OrbitalObject): string {
  const n = ` ${o.name.toUpperCase()} `;
  if (o.id === ISS_ID || / ZARYA /.test(n)) return 'iss';
  if (o.id === '20580' || / HUBBLE | HST /.test(n)) return 'hubble';
  if (/ JWST | WEBB /.test(n)) return 'jwst';
  if (/ DRAGON /.test(n)) return 'dragon';
  if (/ SOYUZ /.test(n)) return 'soyuz';
  if (/ CYGNUS /.test(n)) return 'cygnus';
  switch (o.category) {
    case 'stations':
      return 'station_generic';
    case 'navigation':
      return 'navigation_generic';
    case 'geostationary':
      return 'geo_generic';
    case 'science':
      return 'science_generic';
    default:
      return 'satellite_generic';
  }
}

function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  const select = useStore((s) => s.select);
  return (
    <div className="panel info">
      <div className="panel__head">
        <span className="panel__title">{title}</span>
        <button className="iconbtn" onClick={() => select(null)} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="info__scroll">{children}</div>
    </div>
  );
}

function SatInfo({ object }: { object: OrbitalObject }) {
  const telemetry = useTelemetry(object);
  const { data: descriptions } = useDescriptions(true);
  const { data: imagery } = useImageryManifest();
  const favourite = useStore((s) => s.favourites.includes(object.id));
  const toggleFavourite = useStore((s) => s.toggleFavourite);
  const focusOn = useStore((s) => s.focusOn);

  const meta = CATEGORIES[object.category];
  const desc = descriptions?.[object.id]?.d;
  const imgKey = photoKeyFor(object);
  const imgPath = imagery?.[imgKey];

  return (
    <PanelShell title="Tracked object">
      <div className="info__cat" style={{ color: meta.cssColor }}>
        <span className="glyph">{meta.glyph}</span>
        {meta.label}
        <button
          className={`iconbtn${favourite ? ' on' : ''}`}
          style={{ marginLeft: 'auto' }}
          onClick={() => toggleFavourite(object.id)}
          aria-label="Toggle favourite"
        >
          {favourite ? '★' : '☆'}
        </button>
      </div>
      <div className="info__name">{object.name}</div>
      <div className="info__nid">NORAD {object.id}</div>

      {imgPath && <img className="info__img" src={dataClient.imageUrl(imgPath)} alt={object.name} />}
      {desc && <p className="info__lead">{desc}</p>}

      {object.id === ISS_ID && <IssCrew />}

      <div className="chips">
        {telemetry && <span className="chip">{orbitRegime(telemetry.state.altitudeKm)}</span>}
        <span className="chip">{meta.label}</span>
      </div>

      <div className="label">Live telemetry</div>
      {telemetry ? (
        <div className="stats">
          <Stat k="Altitude" v={formatKm(telemetry.state.altitudeKm)} />
          <Stat
            k="Speed"
            v={
              <>
                {formatSpeedKmS(telemetry.state.speedKmS)} <small>· {formatSpeedMph(telemetry.state.speedKmS)}</small>
              </>
            }
          />
          <Stat k="Inclination" v={`${telemetry.meta.inclinationDeg.toFixed(1)}°`} />
          <Stat k="Period" v={formatPeriod(telemetry.meta.periodMin)} />
          <Stat k="Apogee" v={formatKm(telemetry.meta.apogeeKm)} />
          <Stat k="Perigee" v={formatKm(telemetry.meta.perigeeKm)} />
          <Stat
            k="Ground point"
            v={formatLatLon(telemetry.state.latitudeDeg, telemetry.state.longitudeDeg)}
          />
          <Stat k="Eccentricity" v={telemetry.meta.eccentricity.toFixed(4)} />
        </div>
      ) : (
        <p className="info__lead">Computing position…</p>
      )}

      <div className="info__foot">
        <button className="btn" onClick={() => focusOn(object.id)}>
          ◎ Centre on globe
        </button>
      </div>
    </PanelShell>
  );
}

function NeoInfo({ neo }: { neo: NeoElements }) {
  const { data: neoDescriptions } = useNeoDescriptions(true);
  const desc = neoDescriptions?.[neo.name]?.description;
  const diameter = neoDiameterKm(neo);
  const periodYears = Math.pow(neo.a, 1.5);

  return (
    <PanelShell title="Near-Earth object">
      <div className="info__cat" style={{ color: CATEGORIES.hazardous.cssColor }}>
        <span className="glyph">{CATEGORIES.hazardous.glyph}</span>
        Hazardous NEO · {neo.cls ?? 'asteroid'}
      </div>
      <div className="info__name">{neo.name}</div>
      {neo.fn && <div className="info__nid">{neo.fn}</div>}

      <NeoOrbitDiagram neo={neo} />
      {desc && <p className="info__lead">{desc}</p>}

      <div className="chips">
        {diameter && <span className="chip">⌀ {diameter.toFixed(2)} km</span>}
        {neo.nd && <span className="chip">Next pass {neo.nd}</span>}
        {neo.nl && <span className="chip">{neo.nl.toFixed(0)} lunar distances</span>}
      </div>

      <div className="label">Orbital elements</div>
      <div className="stats">
        <Stat k="Semi-major axis" v={<>{neo.a.toFixed(3)} <small>AU</small></>} />
        <Stat k="Eccentricity" v={neo.e.toFixed(4)} />
        <Stat k="Inclination" v={`${neo.i.toFixed(1)}°`} />
        <Stat k="Orbital period" v={<>{periodYears.toFixed(2)} <small>yr</small></>} />
      </div>
    </PanelShell>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat__k">{k}</div>
      <div className="stat__v">{v}</div>
    </div>
  );
}

export function InfoPanel() {
  const selection = useSelection();
  if (!selection) return null;
  return selection.kind === 'sat' ? (
    <SatInfo object={selection.object} />
  ) : (
    <NeoInfo neo={selection.neo} />
  );
}

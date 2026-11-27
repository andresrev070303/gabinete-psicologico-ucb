import type { ReactNode } from 'react';
import { Brand } from './Brand';
import { Icon } from './Icon';

export function AccessLayout({ children }: { children: ReactNode }) {
  return (
    <main className="access-layout">
      <section
        className="access-story"
        aria-label="Gabinete de Servicios Psicológicos UCB"
      >
        <Brand light />
        <div className="access-story-content">
          <span className="eyebrow">UNIVERSIDAD CATÓLICA BOLIVIANA</span>
          <p className="access-story-title">
            Un espacio para
            <br />
            <span>acompañar.</span>
          </p>
          <p>
            Personas, aprendizaje y bienestar. Un mismo lugar para organizar el
            trabajo de nuestro Gabinete.
          </p>
          <div className="access-art" aria-hidden="true">
            <div className="art-orbit art-orbit--outer" />
            <div className="art-orbit art-orbit--inner" />
            <span className="art-center">
              <Icon name="book" />
            </span>
            <span className="art-dot art-dot--gold" />
            <span className="art-dot art-dot--blue" />
            <span className="art-leaf art-leaf--one" />
            <span className="art-leaf art-leaf--two" />
          </div>
        </div>
        <p className="access-story-footer">
          Carrera de Psicología <span aria-hidden="true">·</span> Cochabamba
        </p>
      </section>
      <section className="access-content" aria-label="Acceso al sistema">
        <div className="access-mobile-brand">
          <Brand />
        </div>
        <div className="access-card">{children}</div>
        <p className="access-footer">
          Gabinete de Servicios Psicológicos · UCB Cochabamba
        </p>
      </section>
    </main>
  );
}

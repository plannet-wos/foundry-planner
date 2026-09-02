import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';
import { AllianceService } from '../../core/services/alliance.service';
import { Alliance } from '../../core/models/alliance.model';

@Component({
  selector: 'app-alliance-select',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './alliance-select.html',
  styleUrl: './alliance-select.scss'
})
export class AllianceSelect implements OnInit {
  private allianceService = inject(AllianceService);
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);

  alliances$!: Observable<Alliance[]>;

  ngOnInit() {
    const stateId = this.route.snapshot.paramMap.get('stateId')!;
    this.alliances$ = this.allianceService.listForState$(stateId);
  }

  select(alliance: Alliance) {
    this.router.navigate([alliance.stateId, 'alliance', alliance.slug, 'plan']);
  }
}

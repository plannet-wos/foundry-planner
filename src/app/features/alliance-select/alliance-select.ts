import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
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
  private router          = inject(Router);

  alliances$!: Observable<Alliance[]>;

  ngOnInit() {
    this.alliances$ = this.allianceService.getAlliances();
  }

  select(allianceId: string) {
    this.router.navigate(['/alliance', allianceId, 'plan']);
  }
}

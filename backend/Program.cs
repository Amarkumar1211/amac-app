using Microsoft.EntityFrameworkCore;
using AmacBackend.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString)
           .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning)));

var jwtKey = builder.Configuration["JwtKey"] ?? throw new InvalidOperationException("JwtKey missing");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer = false,
            ValidateAudience = false
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseStaticFiles();

app.MapGet("/", () => "AMAC ASP.NET Core Backend is running!");

// ── Seed department accounts on startup ──────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate(); // ensure latest migration applied

    var departmentAccounts = new[]
    {
        ("admin",            "admin123",   "Admin",      ""),
        ("production",       "prod123",    "Department", "Production"),
        ("supervisor",       "sup123",     "Supervisor", "Production"),
        ("hod",              "hod123",     "HOD",        "Production"),
        ("dcf",              "dcf123",     "Department", "DCF"),
        ("quality",          "qual123",    "Department", "Quality"),
        ("ht_finishing",     "htf123",     "Department", "HT & Finishing"),
        ("machining",        "mach123",    "Department", "Machining"),
        ("storage_dispatch", "disp123",    "Department", "Storage & Dispatch"),
    };

    foreach (var (uname, pwd, role, dept) in departmentAccounts)
    {
        var existing = db.Users.FirstOrDefault(u => u.Username == uname);
        if (existing == null)
        {
            db.Users.Add(new User
            {
                Username = uname,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(pwd),
                Role = role,
                Department = dept
            });
        }
        else 
        {
            if (string.IsNullOrEmpty(existing.Department) && !string.IsNullOrEmpty(dept))
            {
                // Backfill department on existing accounts
                existing.Department = dept;
                existing.Role = role;
            }
            if (string.IsNullOrEmpty(existing.Role) && !string.IsNullOrEmpty(role))
            {
                existing.Role = role;
            }
        }
    }
    db.SaveChanges();

    // ── Ensure Existing Reasons Have Department Set to 'Production' ──────────
    try
    {
        db.Database.ExecuteSqlRaw(@"
            UPDATE GapReasonMasters SET Department = 'Production' WHERE Department IS NULL OR Department = '';
            UPDATE RejectionReasonMasters SET Department = 'Production' WHERE Department IS NULL OR Department = '';
        ");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Department update note: {ex.Message}");
    }

    // ── Seed Gap Reasons from info.xlsx if empty ──────────────────────────────
    if (!db.GapReasonMasters.Any())
    {
        var initialGapReasons = new List<GapReasonMaster>
        {
            // 1. Manpower
            new() { Department = "Production", Category = "Manpower", ReasonName = "Health Issue", IsActive = true },
            new() { Department = "Production", Category = "Manpower", ReasonName = "Not Available", IsActive = true },
            new() { Department = "Production", Category = "Manpower", ReasonName = "Leave (informed)", IsActive = true },
            new() { Department = "Production", Category = "Manpower", ReasonName = "Leave (not informed)", IsActive = true },
            new() { Department = "Production", Category = "Manpower", ReasonName = "Others", IsActive = true },

            // 2. Machine Breakdown
            new() { Department = "Production", Category = "Machine Breakdown", ReasonName = "Tilt Issue", IsActive = true },
            new() { Department = "Production", Category = "Machine Breakdown", ReasonName = "Auto Issue", IsActive = true },
            new() { Department = "Production", Category = "Machine Breakdown", ReasonName = "Furnace Issue", IsActive = true },
            new() { Department = "Production", Category = "Machine Breakdown", ReasonName = "Die Maintenance", IsActive = true },
            new() { Department = "Production", Category = "Machine Breakdown", ReasonName = "Others", IsActive = true },

            // 3. Raw Material
            new() { Department = "Production", Category = "Raw Material", ReasonName = "Ingot not available", IsActive = true },
            new() { Department = "Production", Category = "Raw Material", ReasonName = "Raiser", IsActive = true },
            new() { Department = "Production", Category = "Raw Material", ReasonName = "Rotary Metal Delay", IsActive = true },
            new() { Department = "Production", Category = "Raw Material", ReasonName = "Others", IsActive = true },

            // 4. Method
            new() { Department = "Production", Category = "Method", ReasonName = "Method Setup Issue", IsActive = true },
            new() { Department = "Production", Category = "Method", ReasonName = "Cycle Parameter Variation", IsActive = true },
            new() { Department = "Production", Category = "Method", ReasonName = "Others", IsActive = true }
        };
        db.GapReasonMasters.AddRange(initialGapReasons);
        db.SaveChanges();
    }

    // ── Seed Rejection Reasons from info.xlsx if empty ────────────────────────
    if (!db.RejectionReasonMasters.Any())
    {
        var initialRejectionReasons = new List<RejectionReasonMaster>
        {
            new() { Department = "Production", ReasonName = "Warm Shot", Category = "Casting", IsActive = true },
            new() { Department = "Production", ReasonName = "Unfill", Category = "Casting", IsActive = true },
            new() { Department = "Production", ReasonName = "Flash problem", Category = "Casting", IsActive = true },
            new() { Department = "Production", ReasonName = "Coating Issue", Category = "Coating", IsActive = true },
            new() { Department = "Production", ReasonName = "Coating Peeloff", Category = "Coating", IsActive = true },
            new() { Department = "Production", ReasonName = "Sand Drop", Category = "Core", IsActive = true },
            new() { Department = "Production", ReasonName = "Metal Catchup", Category = "Casting", IsActive = true },
            new() { Department = "Production", ReasonName = "Shrinkage", Category = "Defect", IsActive = true },
            new() { Department = "Production", ReasonName = "Blow Hole", Category = "Defect", IsActive = true },
            new() { Department = "Production", ReasonName = "Porosity", Category = "Defect", IsActive = true },
            new() { Department = "Production", ReasonName = "Crack", Category = "Defect", IsActive = true },
            new() { Department = "Production", ReasonName = "Pin Hole", Category = "Defect", IsActive = true },
            new() { Department = "Production", ReasonName = "Cold Shut", Category = "Defect", IsActive = true },
            new() { Department = "Production", ReasonName = "Others", Category = "General", IsActive = true }
        };
        db.RejectionReasonMasters.AddRange(initialRejectionReasons);
        db.SaveChanges();
    }
}

var api = app.MapGroup("").RequireAuthorization();

// -- MasterParts --
api.MapGet("/api/masterparts", async (AppDbContext db) =>
{
    var parts = await db.MasterParts.ToListAsync();
    return Results.Ok(parts);
});

api.MapPost("/api/masterparts", async ([FromBody] MasterPart part, AppDbContext db) =>
{
    db.MasterParts.Add(part);
    await db.SaveChangesAsync();
    return Results.Created($"/api/masterparts/{part.Id}", part);
});

api.MapPut("/api/masterparts/{id}", async (int id, [FromBody] MasterPart part, AppDbContext db) =>
{
    var existing = await db.MasterParts.FindAsync(id);
    if (existing == null) return Results.NotFound();
    
    db.Entry(existing).CurrentValues.SetValues(part);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapDelete("/api/masterparts/{id}", async (int id, AppDbContext db) =>
{
    var part = await db.MasterParts.FindAsync(id);
    if (part == null) return Results.NotFound();
    
    db.MasterParts.Remove(part);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

// -- Supervisors --
api.MapGet("/api/supervisors", async (AppDbContext db) =>
{
    return Results.Ok(await db.Supervisors.ToListAsync());
});

api.MapPost("/api/supervisors", async ([FromBody] Supervisor supervisor, AppDbContext db) =>
{
    db.Supervisors.Add(supervisor);
    await db.SaveChangesAsync();
    return Results.Created($"/api/supervisors/{supervisor.Id}", supervisor);
});

api.MapPut("/api/supervisors/{id}", async (int id, [FromBody] Supervisor supervisor, AppDbContext db) =>
{
    var existing = await db.Supervisors.FindAsync(id);
    if (existing == null) return Results.NotFound();
    
    db.Entry(existing).CurrentValues.SetValues(supervisor);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapDelete("/api/supervisors/{id}", async (int id, AppDbContext db) =>
{
    var supervisor = await db.Supervisors.FindAsync(id);
    if (supervisor == null) return Results.NotFound();
    
    db.Supervisors.Remove(supervisor);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

// -- Operators --
api.MapGet("/api/operators", async (AppDbContext db) =>
{
    return Results.Ok(await db.Operators.Include(o => o.Supervisor).ToListAsync());
});

api.MapPost("/api/operators", async ([FromBody] Operator op, AppDbContext db) =>
{
    db.Operators.Add(op);
    await db.SaveChangesAsync();
    return Results.Created($"/api/operators/{op.Id}", op);
});

api.MapPut("/api/operators/{id}", async (int id, [FromBody] Operator op, AppDbContext db) =>
{
    var existing = await db.Operators.FindAsync(id);
    if (existing == null) return Results.NotFound();
    
    db.Entry(existing).CurrentValues.SetValues(op);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapDelete("/api/operators/{id}", async (int id, AppDbContext db) =>
{
    var op = await db.Operators.FindAsync(id);
    if (op == null) return Results.NotFound();
    
    db.Operators.Remove(op);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

// -- Gap Reason Master (CRUD) --
api.MapGet("/api/gapreasons", async (string? department, string? category, AppDbContext db) =>
{
    var q = db.GapReasonMasters.AsQueryable();
    if (!string.IsNullOrEmpty(department) && department != "All")
    {
        q = q.Where(g => g.Department == department || g.Department == "All");
    }
    if (!string.IsNullOrEmpty(category) && category != "All")
    {
        q = q.Where(g => g.Category == category);
    }
    return Results.Ok(await q.OrderBy(g => g.Department).ThenBy(g => g.Category).ThenBy(g => g.ReasonName).ToListAsync());
}).AllowAnonymous();

api.MapPost("/api/gapreasons", async ([FromBody] GapReasonMaster item, AppDbContext db) =>
{
    item.Department = string.IsNullOrWhiteSpace(item.Department) ? "Production" : item.Department.Trim();
    item.CreatedAt = DateTime.UtcNow;
    db.GapReasonMasters.Add(item);
    await db.SaveChangesAsync();
    return Results.Created($"/api/gapreasons/{item.Id}", item);
}).AllowAnonymous();

api.MapPut("/api/gapreasons/{id}", async (int id, [FromBody] GapReasonMaster item, AppDbContext db) =>
{
    var existing = await db.GapReasonMasters.FindAsync(id);
    if (existing == null) return Results.NotFound();

    existing.Department = string.IsNullOrWhiteSpace(item.Department) ? "Production" : item.Department.Trim();
    existing.Category = item.Category;
    existing.ReasonName = item.ReasonName;
    existing.IsActive = item.IsActive;
    await db.SaveChangesAsync();
    return Results.NoContent();
}).AllowAnonymous();

api.MapDelete("/api/gapreasons/{id}", async (int id, AppDbContext db) =>
{
    var item = await db.GapReasonMasters.FindAsync(id);
    if (item == null) return Results.NotFound();

    db.GapReasonMasters.Remove(item);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).AllowAnonymous();

// -- Rejection Reason Master (CRUD) --
api.MapGet("/api/rejectionreasons", async (string? department, string? category, AppDbContext db) =>
{
    var q = db.RejectionReasonMasters.AsQueryable();
    if (!string.IsNullOrEmpty(department) && department != "All")
    {
        q = q.Where(r => r.Department == department || r.Department == "All");
    }
    if (!string.IsNullOrEmpty(category) && category != "All")
    {
        q = q.Where(r => r.Category == category);
    }
    return Results.Ok(await q.OrderBy(r => r.Department).ThenBy(r => r.Category).ThenBy(r => r.ReasonName).ToListAsync());
}).AllowAnonymous();

api.MapPost("/api/rejectionreasons", async ([FromBody] RejectionReasonMaster item, AppDbContext db) =>
{
    item.Department = string.IsNullOrWhiteSpace(item.Department) ? "Production" : item.Department.Trim();
    item.CreatedAt = DateTime.UtcNow;
    db.RejectionReasonMasters.Add(item);
    await db.SaveChangesAsync();
    return Results.Created($"/api/rejectionreasons/{item.Id}", item);
}).AllowAnonymous();

api.MapPut("/api/rejectionreasons/{id}", async (int id, [FromBody] RejectionReasonMaster item, AppDbContext db) =>
{
    var existing = await db.RejectionReasonMasters.FindAsync(id);
    if (existing == null) return Results.NotFound();

    existing.Department = string.IsNullOrWhiteSpace(item.Department) ? "Production" : item.Department.Trim();
    existing.ReasonName = item.ReasonName;
    existing.Category = item.Category;
    existing.IsActive = item.IsActive;
    await db.SaveChangesAsync();
    return Results.NoContent();
}).AllowAnonymous();

api.MapDelete("/api/rejectionreasons/{id}", async (int id, AppDbContext db) =>
{
    var item = await db.RejectionReasonMasters.FindAsync(id);
    if (item == null) return Results.NotFound();

    db.RejectionReasonMasters.Remove(item);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).AllowAnonymous();

// -- Master Database (Unified View) --
api.MapGet("/api/masterdatabase", async (string monthYear, AppDbContext db) =>
{
    if (!DateTime.TryParse(monthYear, out var targetMonth)) return Results.BadRequest("Invalid month format");
    
    var parts = await db.MasterParts.ToListAsync();
    var plans = await db.MonthlyDispatchPlans
        .Where(p => p.MonthYear.Year == targetMonth.Year && p.MonthYear.Month == targetMonth.Month)
        .ToDictionaryAsync(p => p.PartId);
        
    var prevMonthStart = new DateTime(targetMonth.Year, targetMonth.Month, 1).AddMonths(-1);
    var prevMonthEnd = prevMonthStart.AddMonths(1);
    
    var prodEntries = await db.ProductionEntries
        .Where(pe => pe.Date >= prevMonthStart && pe.Date < prevMonthEnd)
        .ToListAsync();
    var downEntries = await db.DownstreamProcessEntries
        .Where(de => de.Date >= prevMonthStart && de.Date < prevMonthEnd && de.PartId.HasValue)
        .ToListAsync();
        
    var prodGroups = prodEntries.GroupBy(pe => pe.PartId).ToDictionary(g => g.Key, g => new {
        TotalProduced = g.Sum(pe => (double)pe.ActualQty + (double)pe.RejectionQty),
        ProdRejections = g.Sum(pe => (double)pe.RejectionQty)
    });
    
    var downGroups = downEntries.GroupBy(de => de.PartId.Value).ToDictionary(g => g.Key, g => g.Sum(de => (double)de.RejectionQty));
        
    var result = parts.Select(part => {
        var plan = plans.ContainsKey(part.Id) ? plans[part.Id] : null;
        
        double totalProduced = prodGroups.ContainsKey(part.Id) ? prodGroups[part.Id].TotalProduced : 0;
        double prodRej = prodGroups.ContainsKey(part.Id) ? prodGroups[part.Id].ProdRejections : 0;
        double downRej = downGroups.ContainsKey(part.Id) ? downGroups[part.Id] : 0;
        double totalRej = prodRej + downRej;
        
        double calcRej = totalProduced > 0 ? Math.Round((double)totalRej / totalProduced * 100, 1) : 0;
        
        return new MasterDatabaseDto
        {
            PartId = part.Id,
            PartNo = part.PartNo,
            PartName = part.PartName,
            Customer = part.Customer,
            ShotWeight = part.ShotWeight,
            CastingWeight = part.CastingWeight,
            CycleTime = part.CycleTime > 0 ? part.CycleTime : (part.ShiftShot > 0 ? Math.Round(36000.0 / part.ShiftShot) : 0),
            NoOfCavity = part.NoOfCavity > 0 ? part.NoOfCavity : 1,
            ShiftShot = part.ShiftShot > 0 ? part.ShiftShot : (part.CycleTime > 0 ? Math.Round(36000.0 / part.CycleTime) : 0),
            Material = part.Material,
            RequiresCore = part.RequiresCore,
            CoreType = part.CoreType,
            RequiresHT = part.RequiresHT,
            HTType = part.HTType,
            ProductionOutputPerMachine = part.ProductionOutputPerMachine,
            DispatchLocation = part.DispatchLocation,
            
            PlanId = plan?.Id,
            MonthYear = monthYear,
            DispatchTarget = plan?.DispatchTarget ?? 0,
            TargetRev01 = plan?.TargetRev01,
            RejectionBufferPercentage = plan?.RejectionBufferPercentage ?? 0,
            CalculatedRejectionPercentage = calcRej
        };
    });
    
    return Results.Ok(result);
});

  api.MapPost("/api/masterdatabase", async ([FromBody] MasterDatabaseDto dto, AppDbContext db) =>
{
    MasterPart part;
    if (dto.PartId == 0)
    {
        // Even if frontend sends PartId=0, check if PartNo exists in DB to prevent unique constraint crashes
        part = await db.MasterParts.FirstOrDefaultAsync(p => p.PartNo == dto.PartNo);
        if (part == null)
        {
            part = new MasterPart();
            db.MasterParts.Add(part);
        }
    }
    else
    {
        part = await db.MasterParts.FindAsync(dto.PartId);
        if (part == null) return Results.NotFound("Part not found.");
    }
    
    part.PartNo = dto.PartNo;
    part.PartName = dto.PartName;
    part.Customer = dto.Customer;
    part.ShotWeight = dto.ShotWeight;
    part.CastingWeight = dto.CastingWeight;
    part.NoOfCavity = dto.NoOfCavity > 0 ? dto.NoOfCavity : 1;
    if (dto.CycleTime > 0)
    {
        part.CycleTime = dto.CycleTime;
        part.ShiftShot = dto.ShiftShot > 0 ? dto.ShiftShot : Math.Round(36000.0 / dto.CycleTime);
    }
    else if (dto.ShiftShot > 0)
    {
        part.ShiftShot = dto.ShiftShot;
        part.CycleTime = Math.Round(36000.0 / dto.ShiftShot);
    }
    else
    {
        part.CycleTime = 0;
        part.ShiftShot = 0;
    }
    part.Material = dto.Material;
    part.RequiresCore = dto.RequiresCore;
    part.CoreType = dto.CoreType;
    part.RequiresHT = dto.RequiresHT;
    part.HTType = dto.HTType;
    part.ProductionOutputPerMachine = dto.ProductionOutputPerMachine;
    part.DispatchLocation = dto.DispatchLocation;
    
    await db.SaveChangesAsync();
    
    if (!DateTime.TryParse(dto.MonthYear, out var targetMonth)) return Results.BadRequest("Invalid month format");
    
    MonthlyDispatchPlan plan = await db.MonthlyDispatchPlans
        .FirstOrDefaultAsync(p => p.PartId == part.Id && p.MonthYear.Year == targetMonth.Year && p.MonthYear.Month == targetMonth.Month);
        
    if (plan == null)
    {
        plan = new MonthlyDispatchPlan
        {
            PartId = part.Id,
            MonthYear = targetMonth,
        };
        db.MonthlyDispatchPlans.Add(plan);
    }
    
    plan.DispatchTarget = dto.DispatchTarget;
    plan.TargetRev01 = dto.TargetRev01;
    plan.RejectionBufferPercentage = dto.RejectionBufferPercentage;
    
    await db.SaveChangesAsync();
    
    dto.PartId = part.Id;
    dto.PlanId = plan.Id;
    
    return Results.Ok(dto);
});

  // -- Production Plans --

api.MapPost("/api/masterdatabase/reset", async (ResetRequest req, AppDbContext db) =>
{
    if (req == null || string.IsNullOrEmpty(req.password) || req.password != "Admin@123") 
    {
        return Results.BadRequest("Wrong password!");
    }
    
    try
    {
        await db.DownstreamProcessEntries.ExecuteDeleteAsync();
        await db.ProductionEntries.ExecuteDeleteAsync();
        await db.MonthlyDispatchPlans.ExecuteDeleteAsync();
        await db.ProductionPlans.ExecuteDeleteAsync();
        await db.MasterParts.ExecuteDeleteAsync();
        return Results.Ok(new { message = "Database reset successfully." });
    }
    catch (Exception ex)
    {
        System.IO.File.WriteAllText("reset_error_log.txt", ex.ToString());
        return Results.Problem(ex.Message);
    }
});


api.MapPost("/api/masterdatabase/bulk", async ([FromBody] List<MasterDatabaseDto> dtos, AppDbContext db) =>
{
    int success = 0;
    int fail = 0;
    
    using var transaction = await db.Database.BeginTransactionAsync();
    
    try 
    {
        foreach (var dto in dtos)
        {
            MasterPart part;
            if (dto.PartId == 0)
            {
                part = await db.MasterParts.FirstOrDefaultAsync(p => p.PartNo == dto.PartNo);
                if (part == null)
                {
                    part = new MasterPart();
                    db.MasterParts.Add(part);
                }
            }
            else
            {
                part = await db.MasterParts.FindAsync(dto.PartId);
                if (part == null) 
                {
                    fail++;
                    continue;
                }
            }
            
            part.PartNo = dto.PartNo;
            part.PartName = dto.PartName;
            part.Customer = dto.Customer;
            part.ShotWeight = dto.ShotWeight;
            part.CastingWeight = dto.CastingWeight;
            part.NoOfCavity = dto.NoOfCavity > 0 ? dto.NoOfCavity : 1;
            if (dto.CycleTime > 0)
            {
                part.CycleTime = dto.CycleTime;
                part.ShiftShot = dto.ShiftShot > 0 ? dto.ShiftShot : Math.Round(36000.0 / dto.CycleTime);
            }
            else if (dto.ShiftShot > 0)
            {
                part.ShiftShot = dto.ShiftShot;
                part.CycleTime = Math.Round(36000.0 / dto.ShiftShot);
            }
            else
            {
                part.CycleTime = 0;
                part.ShiftShot = 0;
            }
            part.Material = dto.Material;
            part.RequiresCore = dto.RequiresCore;
            part.CoreType = dto.CoreType;
            part.RequiresHT = dto.RequiresHT;
            part.HTType = dto.HTType;
            part.ProductionOutputPerMachine = dto.ProductionOutputPerMachine;
            part.DispatchLocation = dto.DispatchLocation;
            
            await db.SaveChangesAsync(); // Save part to get ID for plan
            
            if (DateTime.TryParse(dto.MonthYear, out var targetMonth))
            {
                MonthlyDispatchPlan plan = await db.MonthlyDispatchPlans
                    .FirstOrDefaultAsync(p => p.PartId == part.Id && p.MonthYear.Year == targetMonth.Year && p.MonthYear.Month == targetMonth.Month);
                    
                if (plan == null)
                {
                    plan = new MonthlyDispatchPlan
                    {
                        PartId = part.Id,
                        MonthYear = targetMonth,
                    };
                    db.MonthlyDispatchPlans.Add(plan);
                }
                
                plan.DispatchTarget = dto.DispatchTarget;
                plan.TargetRev01 = dto.TargetRev01;
                plan.RejectionBufferPercentage = dto.RejectionBufferPercentage;
                
                await db.SaveChangesAsync();
            }
            success++;
        }
        await transaction.CommitAsync();
        return Results.Ok(new { success, fail });
    }
    catch (Exception ex)
    {
        await transaction.RollbackAsync();
        return Results.BadRequest($"Bulk upload failed: {ex.InnerException?.Message ?? ex.Message}. No records were saved.");
    }
});

api.MapGet("/api/productionplans", async (AppDbContext db) =>
{
    return Results.Ok(await db.ProductionPlans.Include(p => p.Part).ToListAsync());
});

api.MapPost("/api/productionplans", async ([FromBody] ProductionPlan plan, AppDbContext db) =>
{
    db.ProductionPlans.Add(plan);
    await db.SaveChangesAsync();
    return Results.Created($"/api/productionplans/{plan.Id}", plan);
});

api.MapPut("/api/productionplans/{id}", async (int id, [FromBody] ProductionPlan plan, AppDbContext db) =>
{
    var existing = await db.ProductionPlans.FindAsync(id);
    if (existing == null) return Results.NotFound();
    
    db.Entry(existing).CurrentValues.SetValues(plan);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapDelete("/api/productionplans/{id}", async (int id, AppDbContext db) =>
{
    var plan = await db.ProductionPlans.FindAsync(id);
    if (plan == null) return Results.NotFound();
    
    db.ProductionPlans.Remove(plan);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

// -- Production Entries --
api.MapGet("/api/productionentries", async (AppDbContext db) =>
{
    return Results.Ok(await db.ProductionEntries
        .Include(e => e.Part)
        .Include(e => e.Plan)
        .OrderByDescending(e => e.Date)
        .ThenBy(e => e.Shift)
        .ThenBy(e => e.MachineNumber)
        .ToListAsync());
});

api.MapPost("/api/productionentries", async ([FromBody] ProductionEntry entry, AppDbContext db) =>
{
    var entryDate = entry.Date.Date;
    var exists = await db.ProductionEntries.AnyAsync(e => 
        e.Date.Date == entryDate && 
        e.Shift == entry.Shift && 
        e.MachineNumber == entry.MachineNumber);
    if (exists)
    {
        return Results.Conflict(new { message = $"Machine #{entry.MachineNumber} already has an entry for {entry.Date:dd/MM/yyyy} ({entry.Shift}). Duplicate entries for the same machine on the same shift are not allowed." });
    }

    entry.CreatedAt = DateTime.UtcNow;
    db.ProductionEntries.Add(entry);
    await db.SaveChangesAsync();
    return Results.Created($"/api/productionentries/{entry.Id}", entry);
});

api.MapPut("/api/productionentries/{id}", async (int id, [FromBody] ProductionEntry entry, AppDbContext db) =>
{
    var existing = await db.ProductionEntries.FindAsync(id);
    if (existing == null) return Results.NotFound();
    
    var entryDate = entry.Date.Date;
    var conflict = await db.ProductionEntries.AnyAsync(e => 
        e.Id != id &&
        e.Date.Date == entryDate && 
        e.Shift == entry.Shift && 
        e.MachineNumber == entry.MachineNumber);
    if (conflict)
    {
        return Results.Conflict(new { message = $"Machine #{entry.MachineNumber} already has an entry for {entry.Date:dd/MM/yyyy} ({entry.Shift}). Duplicate entries for the same machine on the same shift are not allowed." });
    }
    
    // Auto-update timestamps based on status transitions
    if (existing.Status != "Submitted" && entry.Status == "Submitted") entry.SubmittedAt = DateTime.UtcNow;
    if (existing.Status != "Approved" && entry.Status == "Approved") entry.ApprovedAt = DateTime.UtcNow;
    if (entry.Status == "Draft" || entry.Status == "Returned") {
        entry.SubmittedAt = null;
        entry.ApprovedAt = null;
    }
    // Keep created at
    entry.CreatedAt = existing.CreatedAt;
    
    db.Entry(existing).CurrentValues.SetValues(entry);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapDelete("/api/productionentries/{id}", async (int id, AppDbContext db) =>
{
    var entry = await db.ProductionEntries.FindAsync(id);
    if (entry == null) return Results.NotFound();
    
    db.ProductionEntries.Remove(entry);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapPost("/api/productionentries/shift-action", async ([FromBody] ShiftActionRequest req, AppDbContext db) =>
{
    var targetDate = req.Date.Date;
    var shiftEntries = await db.ProductionEntries
        .Where(e => e.Date.Date == targetDate && e.Shift == req.Shift)
        .ToListAsync();

    if (shiftEntries.Count == 0)
    {
        return Results.NotFound(new { message = $"No production entries found for {req.Date:yyyy-MM-dd} ({req.Shift})." });
    }

    if (req.Action.Equals("Approve", StringComparison.OrdinalIgnoreCase))
    {
        foreach (var entry in shiftEntries)
        {
            entry.Status = "Approved";
            entry.ApprovedAt = DateTime.UtcNow;
            entry.ReturnReason = string.Empty;
        }
    }
    else if (req.Action.Equals("Return", StringComparison.OrdinalIgnoreCase))
    {
        foreach (var entry in shiftEntries)
        {
            entry.Status = "Returned";
            entry.ReturnReason = string.IsNullOrWhiteSpace(req.ReturnReason) ? "Returned by HOD for corrections" : req.ReturnReason;
            entry.SubmittedAt = null;
            entry.ApprovedAt = null;
        }
    }
    else
    {
        return Results.BadRequest(new { message = "Invalid action. Supported: 'Approve', 'Return'." });
    }

    await db.SaveChangesAsync();
    return Results.Ok(new { message = $"Shift {req.Shift} on {req.Date:yyyy-MM-dd} marked as {req.Action}d ({shiftEntries.Count} machines updated)." });
});

api.MapPost("/api/productionentries/bulk-import", async ([FromBody] BulkImportProductionRequest req, AppDbContext db) =>
{
    if (req.Entries == null || req.Entries.Count == 0)
    {
        return Results.BadRequest(new { success = false, message = "No production entry rows provided for import." });
    }

    var masterParts = await db.MasterParts.ToListAsync();
    var operators = await db.Operators.ToListAsync();
    var supervisors = await db.Supervisors.ToListAsync();

    int importedCount = 0;
    int updatedCount = 0;
    int skippedCount = 0;
    var errors = new List<string>();

    using var transaction = await db.Database.BeginTransactionAsync();
    try
    {
        for (int i = 0; i < req.Entries.Count; i++)
        {
            var item = req.Entries[i];
            int rowNum = i + 1;

            if (item.Date == default)
            {
                errors.Add($"Row {rowNum}: Date is missing or invalid.");
                continue;
            }
            if (string.IsNullOrWhiteSpace(item.Shift))
            {
                errors.Add($"Row {rowNum}: Shift is missing.");
                continue;
            }
            if (string.IsNullOrWhiteSpace(item.MachineNumber))
            {
                errors.Add($"Row {rowNum}: Machine Number is missing.");
                continue;
            }

            string cleanShift = item.Shift.Trim();
            if (cleanShift.Equals("A", StringComparison.OrdinalIgnoreCase) || 
                cleanShift.Equals("ShiftA", StringComparison.OrdinalIgnoreCase) || 
                cleanShift.Equals("Shift-A", StringComparison.OrdinalIgnoreCase) || 
                cleanShift.Equals("1", StringComparison.OrdinalIgnoreCase) || 
                cleanShift.Equals("Morning", StringComparison.OrdinalIgnoreCase)) 
            {
                cleanShift = "Shift A";
            }
            else if (cleanShift.Equals("B", StringComparison.OrdinalIgnoreCase) || 
                     cleanShift.Equals("ShiftB", StringComparison.OrdinalIgnoreCase) || 
                     cleanShift.Equals("Shift-B", StringComparison.OrdinalIgnoreCase) || 
                     cleanShift.Equals("2", StringComparison.OrdinalIgnoreCase) || 
                     cleanShift.Equals("Evening", StringComparison.OrdinalIgnoreCase)) 
            {
                cleanShift = "Shift B";
            }

            // Resolve Part with maximum tolerance (Exact, Zero-stripped, Space/Hyphen stripped, PartName, or Auto-create)
            MasterPart? part = null;
            if (item.PartId.HasValue && item.PartId.Value > 0)
            {
                part = masterParts.FirstOrDefault(p => p.Id == item.PartId.Value);
            }
            if (part == null && !string.IsNullOrWhiteSpace(item.PartNo))
            {
                var cleanPartNo = item.PartNo.Trim().ToLower();
                var cleanPartNoNoLeadingZeros = cleanPartNo.TrimStart('0');
                var cleanPartNoNoSpaces = cleanPartNo.Replace(" ", "").Replace("-", "");

                part = masterParts.FirstOrDefault(p => 
                    p.PartNo.Trim().ToLower() == cleanPartNo ||
                    p.PartNo.Trim().ToLower().TrimStart('0') == cleanPartNoNoLeadingZeros ||
                    p.PartNo.Trim().ToLower().Replace(" ", "").Replace("-", "") == cleanPartNoNoSpaces ||
                    (!string.IsNullOrWhiteSpace(p.PartName) && p.PartName.Trim().ToLower() == cleanPartNo)
                );
            }

            if (part == null && !string.IsNullOrWhiteSpace(item.PartName))
            {
                var cleanPartName = item.PartName.Trim().ToLower();
                part = masterParts.FirstOrDefault(p => !string.IsNullOrWhiteSpace(p.PartName) && p.PartName.Trim().ToLower() == cleanPartName);
            }

            // Strict Requirement: Do NOT process or auto-create new/unregistered part names or numbers!
            // Restrict and skip this specific row, while allowing all remaining valid rows to be processed.
            if (part == null)
            {
                skippedCount++;
                string partIdentifier = !string.IsNullOrWhiteSpace(item.PartNo) ? item.PartNo : (item.PartName ?? "Unknown");
                errors.Add($"Row {rowNum} (Machine #{item.MachineNumber}): Part '{partIdentifier}' is not registered in Master Database and was restricted from import. Only registered parts can be processed.");
                continue;
            }

            // Planned Qty: No of Cavity * Shift Shot (where Shift Shot = (10hrs * 3600) / Cycle Time = 36000 / Cycle Time)
            double planned = item.PlannedQty;
            if (planned <= 0)
            {
                int cavity = part.NoOfCavity > 0 ? part.NoOfCavity : 1;
                double shots = part.ShiftShot > 0 
                    ? part.ShiftShot 
                    : (part.CycleTime > 0 ? Math.Round(36000.0 / part.CycleTime) : 0);
                
                if (shots > 0)
                {
                    planned = cavity * shots;
                }
                else if (part.ProductionOutputPerMachine > 0)
                {
                    planned = Math.Ceiling(part.ProductionOutputPerMachine / 2.0);
                }
            }

            double actual = item.ActualQty;
            double rej = item.RejectionQty;
            double gap = item.Gap ?? (planned > actual ? planned - actual : 0);
            double cycleTime = item.CycleTime ?? part.CycleTime;
            double efficiency = planned > 0 ? Math.Round((actual / planned) * 100.0, 1) : 0;

            // Resolve operator punch & supervisor remark
            string punchNo = item.OperatorPunchNo?.Trim() ?? string.Empty;
            string remark = item.Remark?.Trim() ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(item.Supervisor))
            {
                if (!remark.Contains("[Supervisor:"))
                {
                    remark = string.IsNullOrWhiteSpace(remark) 
                        ? $"[Supervisor: {item.Supervisor.Trim()}]" 
                        : $"{remark} [Supervisor: {item.Supervisor.Trim()}]";
                }
            }

            // Traceability ID
            string traceId = item.TraceabilityBatchId?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(traceId))
            {
                string alias = "X";
                if (!string.IsNullOrWhiteSpace(punchNo))
                {
                    var cleanPunch = punchNo.ToLower();
                    var op = operators.FirstOrDefault(o => o.PunchNo.Trim().ToLower() == cleanPunch || o.Name.Trim().ToLower() == cleanPunch);
                    if (op != null)
                    {
                        alias = !string.IsNullOrWhiteSpace(op.AliasLetter) ? op.AliasLetter : op.Name.Substring(0, 1).ToUpper();
                    }
                }
                string dateDigits = $"{item.Date.Day:D2}{item.Date.Month:D2}{item.Date.Year % 100:D2}";
                string shiftLetter = cleanShift.EndsWith("B", StringComparison.OrdinalIgnoreCase) ? "B" : "A";
                traceId = $"{alias}{dateDigits}{shiftLetter}";
            }

            // Mandatory: All imported entries (even from Admin Panel) require HOD approval
            string targetStatus = "Submitted";

            var entryDate = item.Date.Date;
            var cleanMachine = item.MachineNumber.Trim();

            var existing = await db.ProductionEntries
                .FirstOrDefaultAsync(e => e.Date.Date == entryDate && e.Shift == cleanShift && e.MachineNumber == cleanMachine);

            if (existing != null)
            {
                if (!req.OverwriteExisting)
                {
                    skippedCount++;
                    continue;
                }

                existing.TraceabilityBatchId = traceId;
                existing.OperatorPunchNo = punchNo;
                existing.PartId = part.Id;
                existing.DieNo = item.DieNo?.Trim() ?? string.Empty;
                existing.CycleTime = cycleTime;
                existing.PlannedQty = planned;
                existing.ActualQty = actual;
                existing.RejectionQty = rej;
                existing.Gap = gap;
                existing.Efficiency = efficiency;
                existing.ReasonForRejection = item.ReasonForRejection?.Trim() ?? string.Empty;
                existing.GapReasonManPower = item.GapReasonManPower;
                existing.GapReasonMachineBreakdown = item.GapReasonMachineBreakdown;
                existing.GapReasonMaterialShortage = item.GapReasonMaterialShortage;
                existing.GapReasonMethod = item.GapReasonMethod;
                existing.GapQtyManPower = item.GapQtyManPower;
                existing.GapQtyMachineBreakdown = item.GapQtyMachineBreakdown;
                existing.GapQtyMaterialShortage = item.GapQtyMaterialShortage;
                existing.GapQtyMethod = item.GapQtyMethod;
                existing.Remark = remark;
                existing.Status = targetStatus;
                if (targetStatus == "Approved")
                {
                    existing.ApprovedAt = DateTime.UtcNow;
                    existing.SubmittedAt = DateTime.UtcNow;
                }
                else if (targetStatus == "Submitted")
                {
                    existing.SubmittedAt = DateTime.UtcNow;
                    existing.ApprovedAt = null;
                }

                updatedCount++;
            }
            else
            {
                var newEntry = new ProductionEntry
                {
                    TraceabilityBatchId = traceId,
                    Date = entryDate,
                    Shift = cleanShift,
                    OperatorPunchNo = punchNo,
                    PartId = part.Id,
                    DieNo = item.DieNo?.Trim() ?? string.Empty,
                    MachineNumber = cleanMachine,
                    CycleTime = cycleTime,
                    PlannedQty = planned,
                    ActualQty = actual,
                    RejectionQty = rej,
                    Gap = gap,
                    Efficiency = efficiency,
                    ReasonForRejection = item.ReasonForRejection?.Trim() ?? string.Empty,
                    GapReasonManPower = item.GapReasonManPower,
                    GapReasonMachineBreakdown = item.GapReasonMachineBreakdown,
                    GapReasonMaterialShortage = item.GapReasonMaterialShortage,
                    GapReasonMethod = item.GapReasonMethod,
                    GapQtyManPower = item.GapQtyManPower,
                    GapQtyMachineBreakdown = item.GapQtyMachineBreakdown,
                    GapQtyMaterialShortage = item.GapQtyMaterialShortage,
                    GapQtyMethod = item.GapQtyMethod,
                    Remark = remark,
                    Status = targetStatus,
                    CreatedAt = DateTime.UtcNow,
                    SubmittedAt = (targetStatus == "Approved" || targetStatus == "Submitted") ? DateTime.UtcNow : null,
                    ApprovedAt = targetStatus == "Approved" ? DateTime.UtcNow : null
                };

                db.ProductionEntries.Add(newEntry);
                importedCount++;
            }
        }

        await db.SaveChangesAsync();
        await transaction.CommitAsync();

        return Results.Ok(new
        {
            success = true,
            importedCount,
            updatedCount,
            skippedCount,
            totalProcessed = importedCount + updatedCount,
            errors,
            message = $"Successfully processed {importedCount + updatedCount} shift entries ({importedCount} newly created, {updatedCount} updated, {skippedCount} skipped)."
        });
    }
    catch (Exception ex)
    {
        await transaction.RollbackAsync();
        return Results.BadRequest(new
        {
            success = false,
            message = $"Import transaction failed: {ex.InnerException?.Message ?? ex.Message}",
            errors = new List<string> { ex.Message }
        });
    }
});

// -- Downstream Process Entries --
api.MapGet("/api/downstream", async (string? department, AppDbContext db) =>
{
    var query = db.DownstreamProcessEntries.Include(e => e.Part).AsQueryable();
    if (!string.IsNullOrEmpty(department))
    {
        if (department.Equals("DCF", StringComparison.OrdinalIgnoreCase))
        {
            var dcfDepts = new[] { "DCF", "Decoring", "Cutting", "Fettling", "Filing", "Sand Blasting" };
            query = query.Where(e => dcfDepts.Contains(e.DepartmentName));
        }
        else if (department.Equals("Quality", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(e => e.DepartmentName == "Quality" || e.DepartmentName.StartsWith("U5") || e.DepartmentName.StartsWith("U4B"));
        }
        else if (department.Equals("U5", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(e => e.DepartmentName.StartsWith("U5"));
        }
        else if (department.Equals("U4B", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(e => e.DepartmentName.StartsWith("U4B"));
        }
        else
        {
            query = query.Where(e => e.DepartmentName == department);
        }
    }
    return Results.Ok(await query.OrderByDescending(e => e.Date).ThenByDescending(e => e.Id).ToListAsync());
});

api.MapPost("/api/downstream", async ([FromBody] DownstreamProcessEntry entry, AppDbContext db) =>
{
    if (entry.PartId == null && !string.IsNullOrEmpty(entry.PartNo)) {
        var part = await db.MasterParts.FirstOrDefaultAsync(p => p.PartNo == entry.PartNo);
        if (part != null) {
            entry.PartId = part.Id;
            if (string.IsNullOrEmpty(entry.PartName)) entry.PartName = part.PartName;
        }
    }
    
    if (!string.IsNullOrEmpty(entry.TraceabilityBatchId)) {
        var prod = await db.ProductionEntries.FirstOrDefaultAsync(p => p.TraceabilityBatchId == entry.TraceabilityBatchId);
        if (prod != null && entry.PartId == null) {
            entry.PartId = prod.PartId;
        }
    } else {
        var pCode = !string.IsNullOrEmpty(entry.PartNo) ? entry.PartNo : entry.DepartmentName;
        entry.TraceabilityBatchId = $"{pCode}-{entry.Date:yyyyMMdd}-{entry.Shift.Replace(" ", "")}";
    }

    // Keep legacy InputQty / ProcessedQty in sync with PlannedQty / ActualQty
    if (entry.PlannedQty > 0 && entry.InputQty == 0) entry.InputQty = entry.PlannedQty;
    if (entry.ActualQty > 0 && entry.ProcessedQty == 0) entry.ProcessedQty = entry.ActualQty;
    if (entry.ProcessedQty > 0 && entry.ActualQty == 0) entry.ActualQty = entry.ProcessedQty;
    entry.Gap = Math.Max(0, entry.PlannedQty - entry.ActualQty);
    
    entry.CreatedAt = DateTime.UtcNow;
    db.DownstreamProcessEntries.Add(entry);
    await db.SaveChangesAsync();
    return Results.Created($"/api/downstream/{entry.Id}", entry);
});

api.MapPut("/api/downstream/{id}", async (int id, [FromBody] DownstreamProcessEntry entry, AppDbContext db) =>
{
    var existing = await db.DownstreamProcessEntries.FindAsync(id);
    if (existing == null) return Results.NotFound();
    
    // Auto-update timestamps based on status transitions
    if (existing.Status != "Submitted" && entry.Status == "Submitted") entry.SubmittedAt = DateTime.UtcNow;
    if (existing.Status != "Approved" && entry.Status == "Approved") entry.ApprovedAt = DateTime.UtcNow;
    if (entry.Status == "Draft" || entry.Status == "Returned") {
        entry.SubmittedAt = null;
        entry.ApprovedAt = null;
    }
    // Keep created at
    entry.CreatedAt = existing.CreatedAt;
    
    if (entry.PlannedQty > 0 && entry.InputQty == 0) entry.InputQty = entry.PlannedQty;
    if (entry.ActualQty > 0 && entry.ProcessedQty == 0) entry.ProcessedQty = entry.ActualQty;
    if (entry.ProcessedQty > 0 && entry.ActualQty == 0) entry.ActualQty = entry.ProcessedQty;
    entry.Gap = Math.Max(0, entry.PlannedQty - entry.ActualQty);

    db.Entry(existing).CurrentValues.SetValues(entry);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapDelete("/api/downstream/{id}", async (int id, AppDbContext db) =>
{
    var entry = await db.DownstreamProcessEntries.FindAsync(id);
    if (entry == null) return Results.NotFound();
    
    db.DownstreamProcessEntries.Remove(entry);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

// -- Reports & Dashboards --
api.MapGet("/api/reports/dashboard", async (string? startDate, string? endDate, string? shift, AppDbContext db) =>
{
    var prodQuery = db.ProductionEntries.AsQueryable();
    var downQuery = db.DownstreamProcessEntries.AsQueryable();
    
    if (!string.IsNullOrEmpty(startDate) && DateTime.TryParse(startDate, out var start))
    {
        prodQuery = prodQuery.Where(e => e.Date >= start);
        downQuery = downQuery.Where(e => e.Date >= start);
    }
    
    if (!string.IsNullOrEmpty(endDate) && DateTime.TryParse(endDate, out var end))
    {
        prodQuery = prodQuery.Where(e => e.Date <= end);
        downQuery = downQuery.Where(e => e.Date <= end);
    }
    else if (string.IsNullOrEmpty(startDate) && string.IsNullOrEmpty(endDate))
    {
        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);
        prodQuery = prodQuery.Where(e => e.Date >= today && e.Date < tomorrow);
        downQuery = downQuery.Where(e => e.Date >= today && e.Date < tomorrow);
    }
    
    if (!string.IsNullOrEmpty(shift) && shift != "All")
    {
        prodQuery = prodQuery.Where(e => e.Shift == shift);
        downQuery = downQuery.Where(e => e.Shift == shift);
    }
    
    var prodData = await prodQuery.ToListAsync();
        
    var totalPlanned = prodData.Sum(e => e.PlannedQty);
    var totalActual = prodData.Sum(e => e.ActualQty);
    var totalProdRej = prodData.Sum(e => e.RejectionQty);
    var overallEff = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
    
    var downData = await downQuery.ToListAsync();
    var totalDownRej = downData.Sum(e => e.RejectionQty);
    
    return Results.Ok(new {
        TotalPlanned = totalPlanned,
        TotalActual = totalActual,
        TotalRejections = totalProdRej + totalDownRej,
        OverallEfficiency = Math.Round(overallEff, 2)
    });
});

api.MapGet("/api/reports/analytics", async (string? startDate, string? endDate, AppDbContext db) =>
{
    var prodQuery = db.ProductionEntries.AsQueryable();
    
    if (!string.IsNullOrEmpty(startDate) && DateTime.TryParse(startDate, out var start))
        prodQuery = prodQuery.Where(e => e.Date >= start);
    
    if (!string.IsNullOrEmpty(endDate) && DateTime.TryParse(endDate, out var end))
        prodQuery = prodQuery.Where(e => e.Date <= end);

    var grouped = await prodQuery
        .GroupBy(e => new { e.PartId, e.Part!.PartNo, e.Part.PartName, e.Part.Customer })
        .Select(g => new {
            PartNo = g.Key.PartNo,
            PartName = g.Key.PartName,
            Customer = g.Key.Customer,
            TotalPlanned = g.Sum(x => x.PlannedQty),
            TotalActual = g.Sum(x => x.ActualQty),
            TotalRejection = g.Sum(x => x.RejectionQty)
        })
        .ToListAsync();

    var result = grouped.Select(g => {
        var adherence = g.TotalPlanned > 0 ? (g.TotalActual / g.TotalPlanned) * 100 : 0;
        var rejPercent = g.TotalActual > 0 ? (g.TotalRejection / (g.TotalActual + g.TotalRejection)) * 100 : 0;
        return new {
            g.PartNo,
            g.PartName,
            g.Customer,
            g.TotalPlanned,
            g.TotalActual,
            g.TotalRejection,
            AdherencePercentage = Math.Round(adherence, 2),
            RejectionPercentage = Math.Round(rejPercent, 2)
        };
    }).ToList();

    return Results.Ok(result);
});

api.MapGet("/api/reports/department-performance", async (string? startDate, string? endDate, AppDbContext db) =>
{
    var downQuery = db.DownstreamProcessEntries.AsQueryable();
    
    if (!string.IsNullOrEmpty(startDate) && DateTime.TryParse(startDate, out var start))
        downQuery = downQuery.Where(e => e.Date >= start);
    
    if (!string.IsNullOrEmpty(endDate) && DateTime.TryParse(endDate, out var end))
        downQuery = downQuery.Where(e => e.Date <= end);

    var grouped = await downQuery
        .GroupBy(e => e.DepartmentName)
        .Select(g => new {
            Department = g.Key,
            TotalProcessed = g.Sum(x => x.ProcessedQty),
            TotalRejection = g.Sum(x => x.RejectionQty)
        })
        .ToListAsync();

    var result = grouped.Select(g => {
        var rejPercent = g.TotalProcessed > 0 ? (g.TotalRejection / (g.TotalProcessed + g.TotalRejection)) * 100 : 0;
        return new {
            g.Department,
            g.TotalProcessed,
            g.TotalRejection,
            RejectionPercentage = Math.Round(rejPercent, 2)
        };
    }).ToList();

    return Results.Ok(result);
});

api.MapGet("/api/reports/traceability/{traceId}", async (string traceId, AppDbContext db) =>
{
    var prod = await db.ProductionEntries
        .Include(e => e.Part)
        .Include(e => e.Plan)
        .FirstOrDefaultAsync(e => e.TraceabilityBatchId == traceId);
        
    var downstream = await db.DownstreamProcessEntries
        .Where(e => e.TraceabilityBatchId == traceId)
        .OrderBy(e => e.CreatedAt)
        .ToListAsync();
        
    return Results.Ok(new {
        Production = prod,
        Downstream = downstream
    });
});

app.MapPost("/api/auth/login", async ([FromBody] LoginRequest req, AppDbContext db, IConfiguration config) =>
{
    var user = await db.Users.FirstOrDefaultAsync(u => u.Username == req.Username);
    
    if (user == null) return Results.Unauthorized();

    bool passwordValid = BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash);
    if (!passwordValid)
    {
        // Legacy plain-text fallback for old prototype accounts
        if (user.PasswordHash == req.Password)
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
            await db.SaveChangesAsync();
        }
        else
        {
            return Results.Unauthorized();
        }
    }

    var tokenHandler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
    var key = Encoding.UTF8.GetBytes(config["JwtKey"]!);
    var tokenDescriptor = new SecurityTokenDescriptor
    {
        Subject = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("Department", user.Department ?? "")
        }),
        Expires = DateTime.UtcNow.AddDays(1),
        SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
    };
    var token = tokenHandler.CreateToken(tokenDescriptor);
    
    return Results.Ok(new {
        Token = tokenHandler.WriteToken(token),
        Role = user.Role,
        Username = user.Username,
        Department = user.Department ?? ""
    });
});

// ── User Management (Admin only) ──────────────────────────────────────────────
api.MapGet("/api/users", async (AppDbContext db) =>
{
    var users = await db.Users
        .Select(u => new { u.Id, u.Username, u.Role, u.Department })
        .ToListAsync();
    return Results.Ok(users);
});

api.MapPut("/api/users/{id}/password", async (int id, [FromBody] ChangePasswordRequest req, AppDbContext db) =>
{
    var user = await db.Users.FindAsync(id);
    if (user == null) return Results.NotFound();
    user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.Run();

public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class ChangePasswordRequest
{
    public string NewPassword { get; set; } = string.Empty;
}

public class ResetRequest
{
    public string password { get; set; } = string.Empty;
}

public class ShiftActionRequest
{
    public DateTime Date { get; set; }
    public string Shift { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty; // "Approve" or "Return"
    public string? ReturnReason { get; set; }
}

public class BulkProductionImportDto
{
    public string? TraceabilityBatchId { get; set; }
    public DateTime Date { get; set; }
    public string Shift { get; set; } = string.Empty;
    public string? Supervisor { get; set; }
    public string? OperatorPunchNo { get; set; }
    public string? PartNo { get; set; }
    public string? PartName { get; set; }
    public int? PartId { get; set; }
    public string? DieNo { get; set; }
    public string MachineNumber { get; set; } = string.Empty;
    public double? CycleTime { get; set; }
    public double PlannedQty { get; set; }
    public double ActualQty { get; set; }
    public double RejectionQty { get; set; }
    public string? ReasonForRejection { get; set; }
    public double? Gap { get; set; }
    public bool GapReasonManPower { get; set; }
    public bool GapReasonMachineBreakdown { get; set; }
    public bool GapReasonMaterialShortage { get; set; }
    public bool GapReasonMethod { get; set; }
    public double GapQtyManPower { get; set; }
    public double GapQtyMachineBreakdown { get; set; }
    public double GapQtyMaterialShortage { get; set; }
    public double GapQtyMethod { get; set; }
    public string? Remark { get; set; }
    public string? Status { get; set; }
}

public class BulkImportProductionRequest
{
    public List<BulkProductionImportDto> Entries { get; set; } = new();
    public bool OverwriteExisting { get; set; } = true;
    public string DefaultStatus { get; set; } = "Submitted"; // Mandatory: Requires HOD approval
}









using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AmacBackend.Migrations
{
    /// <inheritdoc />
    public partial class Phase2Optimizations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ProductionEntries_PartId",
                table: "ProductionEntries");

            migrationBuilder.DropIndex(
                name: "IX_MonthlyDispatchPlans_PartId",
                table: "MonthlyDispatchPlans");

            migrationBuilder.AlterColumn<DateTime>(
                name: "MonthYear",
                table: "MonthlyDispatchPlans",
                type: "datetime2",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(50)",
                oldMaxLength: 50);

            migrationBuilder.AddColumn<int>(
                name: "PartId",
                table: "DownstreamProcessEntries",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProductionEntries_Date",
                table: "ProductionEntries",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_ProductionEntries_PartId_Date",
                table: "ProductionEntries",
                columns: new[] { "PartId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_ProductionEntries_TraceabilityBatchId",
                table: "ProductionEntries",
                column: "TraceabilityBatchId");

            migrationBuilder.CreateIndex(
                name: "IX_MonthlyDispatchPlans_PartId_MonthYear",
                table: "MonthlyDispatchPlans",
                columns: new[] { "PartId", "MonthYear" });

            migrationBuilder.CreateIndex(
                name: "IX_DownstreamProcessEntries_Date",
                table: "DownstreamProcessEntries",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_DownstreamProcessEntries_DepartmentName_Date",
                table: "DownstreamProcessEntries",
                columns: new[] { "DepartmentName", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_DownstreamProcessEntries_PartId",
                table: "DownstreamProcessEntries",
                column: "PartId");

            migrationBuilder.AddForeignKey(
                name: "FK_DownstreamProcessEntries_MasterParts_PartId",
                table: "DownstreamProcessEntries",
                column: "PartId",
                principalTable: "MasterParts",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DownstreamProcessEntries_MasterParts_PartId",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropIndex(
                name: "IX_ProductionEntries_Date",
                table: "ProductionEntries");

            migrationBuilder.DropIndex(
                name: "IX_ProductionEntries_PartId_Date",
                table: "ProductionEntries");

            migrationBuilder.DropIndex(
                name: "IX_ProductionEntries_TraceabilityBatchId",
                table: "ProductionEntries");

            migrationBuilder.DropIndex(
                name: "IX_MonthlyDispatchPlans_PartId_MonthYear",
                table: "MonthlyDispatchPlans");

            migrationBuilder.DropIndex(
                name: "IX_DownstreamProcessEntries_Date",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropIndex(
                name: "IX_DownstreamProcessEntries_DepartmentName_Date",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropIndex(
                name: "IX_DownstreamProcessEntries_PartId",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "PartId",
                table: "DownstreamProcessEntries");

            migrationBuilder.AlterColumn<string>(
                name: "MonthYear",
                table: "MonthlyDispatchPlans",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime2");

            migrationBuilder.CreateIndex(
                name: "IX_ProductionEntries_PartId",
                table: "ProductionEntries",
                column: "PartId");

            migrationBuilder.CreateIndex(
                name: "IX_MonthlyDispatchPlans_PartId",
                table: "MonthlyDispatchPlans",
                column: "PartId");
        }
    }
}

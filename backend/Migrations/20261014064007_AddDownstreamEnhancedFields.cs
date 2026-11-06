using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AmacBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddDownstreamEnhancedFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<float>(
                name: "ActualQty",
                table: "DownstreamProcessEntries",
                type: "real",
                nullable: false,
                defaultValue: 0f);

            migrationBuilder.AddColumn<float>(
                name: "Gap",
                table: "DownstreamProcessEntries",
                type: "real",
                nullable: false,
                defaultValue: 0f);

            migrationBuilder.AddColumn<string>(
                name: "GapReason",
                table: "DownstreamProcessEntries",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "GapReasonMachine",
                table: "DownstreamProcessEntries",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "GapReasonManpower",
                table: "DownstreamProcessEntries",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "GapReasonProductionOutput",
                table: "DownstreamProcessEntries",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "OperatorName",
                table: "DownstreamProcessEntries",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PartName",
                table: "DownstreamProcessEntries",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PartNo",
                table: "DownstreamProcessEntries",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<float>(
                name: "PlannedQty",
                table: "DownstreamProcessEntries",
                type: "real",
                nullable: false,
                defaultValue: 0f);

            migrationBuilder.AddColumn<string>(
                name: "Remark",
                table: "DownstreamProcessEntries",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Supervisor",
                table: "DownstreamProcessEntries",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ActualQty",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "Gap",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "GapReason",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "GapReasonMachine",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "GapReasonManpower",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "GapReasonProductionOutput",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "OperatorName",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "PartName",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "PartNo",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "PlannedQty",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "Remark",
                table: "DownstreamProcessEntries");

            migrationBuilder.DropColumn(
                name: "Supervisor",
                table: "DownstreamProcessEntries");
        }
    }
}
